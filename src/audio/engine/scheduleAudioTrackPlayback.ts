import { getAudioClipPlaybackDuration } from "@/audio/engine/shared";
import type { CompiledTrackSchedule } from "@/audio/engine/compiledTrackSchedules";
import type { AudioClip } from "@/types";
import type { PlaybackSyncPoint, TrackNodeChain, TrackScheduleCursor } from "./runtimeTypes";

interface ScheduleAudioTrackPlaybackParams {
  compiledTrack: Extract<CompiledTrackSchedule, { track: { type: "audio" } }> | CompiledTrackSchedule;
  context: AudioContext;
  trackChain: TrackNodeChain;
  cursor: TrackScheduleCursor;
  absoluteCurrentTime: number;
  scheduleUntilWindow: number;
  isLooping: boolean;
  loopStart: number;
  loopEnd: number;
  revision: number;
  lastSyncPoint: PlaybackSyncPoint;
  scheduledNotes: Set<string>;
  pendingSchedules: Set<string>;
  activeNodes: Set<AudioScheduledSourceNode>;
  playbackSession: number;
  getCurrentPlaybackSession: () => number;
  getDecodedClipAudioBuffer: (
    context: AudioContext,
    clip: AudioClip,
  ) => Promise<AudioBuffer | null>;
}

export const scheduleAudioTrackPlayback = ({
  activeNodes,
  absoluteCurrentTime,
  compiledTrack,
  context,
  cursor,
  getCurrentPlaybackSession,
  getDecodedClipAudioBuffer,
  isLooping,
  lastSyncPoint,
  loopEnd,
  loopStart,
  pendingSchedules,
  playbackSession,
  revision,
  scheduledNotes,
  scheduleUntilWindow,
  trackChain,
}: ScheduleAudioTrackPlaybackParams) => {
  const loopLength = loopEnd - loopStart;
  let audioStartIndex = 0;

  if (!isLooping || loopLength <= 0) {
    while (
      cursor.audioIndex < compiledTrack.audioClipEvents.length &&
      compiledTrack.audioClipEvents[cursor.audioIndex].estimatedEndTime <=
        absoluteCurrentTime
    ) {
      cursor.audioIndex += 1;
    }

    audioStartIndex = cursor.audioIndex;
  }

  for (
    let audioIndex = audioStartIndex;
    audioIndex < compiledTrack.audioClipEvents.length;
    audioIndex += 1
  ) {
    const audioEvent = compiledTrack.audioClipEvents[audioIndex];
    const clip = audioEvent.clip;

    const scheduleAudioClipInstance = async (
      monotonicStartTime: number,
      iteration: number,
    ) => {
      if (!clip.audioData && !clip.audioAssetPath) {
        return;
      }

      const scheduleKey = `${compiledTrack.track.id}:${clip.id}:audio:${revision}:${iteration}`;
      if (scheduledNotes.has(scheduleKey) || pendingSchedules.has(scheduleKey)) {
        return;
      }

      pendingSchedules.add(scheduleKey);

      try {
        const audioBuffer = await getDecodedClipAudioBuffer(context, clip);
        if (!audioBuffer || playbackSession !== getCurrentPlaybackSession()) {
          return;
        }

        const clipOffset = clip.audioOffset ?? 0;
        const availableDuration = Math.max(0, audioBuffer.duration - clipOffset);
        const playbackDuration = getAudioClipPlaybackDuration(
          clip.duration,
          availableDuration,
        );
        const clipEndTime = monotonicStartTime + playbackDuration;

        if (
          playbackDuration <= 0 ||
          clipEndTime <= absoluteCurrentTime ||
          monotonicStartTime > scheduleUntilWindow
        ) {
          return;
        }

        const targetStartAt =
          lastSyncPoint.audioTime +
          (monotonicStartTime - lastSyncPoint.sequenceTime);
        const actualStartAt = Math.max(context.currentTime, targetStartAt);
        const startDelay = Math.max(0, actualStartAt - targetStartAt);
        const clipProgress =
          Math.max(0, absoluteCurrentTime - monotonicStartTime) + startDelay;
        const playbackOffset = clipOffset + clipProgress;
        const remainingDuration = playbackDuration - clipProgress;

        if (remainingDuration <= 0) {
          return;
        }

        const source = context.createBufferSource();
        const clipGain = context.createGain();

        source.buffer = audioBuffer;
        source.connect(clipGain);
        clipGain.connect(trackChain.gain);

        source.start(actualStartAt, playbackOffset, remainingDuration);

        activeNodes.add(source);
        scheduledNotes.add(scheduleKey);

        source.onended = () => {
          activeNodes.delete(source);
          source.disconnect();
          clipGain.disconnect();
        };
      } finally {
        pendingSchedules.delete(scheduleKey);
      }
    };

    const absoluteStartTime = audioEvent.absoluteStartTime;

    if (!isLooping && absoluteStartTime > scheduleUntilWindow) {
      break;
    }

    if (isLooping && loopLength > 0 && absoluteStartTime >= loopEnd) {
      break;
    }

    if (!isLooping || loopLength <= 0) {
      void scheduleAudioClipInstance(absoluteStartTime, 0);
    } else if (absoluteStartTime < loopStart) {
      void scheduleAudioClipInstance(absoluteStartTime, 0);
    } else if (absoluteStartTime >= loopStart && absoluteStartTime < loopEnd) {
      const minIter = Math.max(
        0,
        Math.floor((absoluteCurrentTime - absoluteStartTime) / loopLength),
      );
      const maxIter = Math.max(
        0,
        Math.ceil((scheduleUntilWindow - absoluteStartTime) / loopLength),
      );

      for (let iteration = minIter; iteration <= maxIter; iteration += 1) {
        void scheduleAudioClipInstance(
          absoluteStartTime + iteration * loopLength,
          iteration,
        );
      }
    }
  }
};