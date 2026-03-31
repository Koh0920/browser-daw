import {
  midiNoteToFrequency,
  MIN_NOTE_DURATION_SECONDS,
} from "@/audio/engine/shared";
import type { CompiledTrackSchedule } from "@/audio/engine/compiledTrackSchedules";
import type {
  PlaybackSyncPoint,
  TrackNodeChain,
  TrackScheduleCursor,
} from "./runtimeTypes";

interface ScheduleMidiTrackPlaybackParams {
  compiledTrack:
    | Extract<CompiledTrackSchedule, { track: { type: "midi" } }>
    | CompiledTrackSchedule;
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
  activeNodes: Set<AudioScheduledSourceNode>;
  loadInstrumentSample: (
    context: AudioContext,
    url: string,
  ) => Promise<AudioBuffer | null>;
  enableAudioDebug: boolean;
  logAudioDebug: (label: string, payload?: unknown) => void;
}

export const scheduleMidiTrackPlayback = ({
  absoluteCurrentTime,
  activeNodes,
  compiledTrack,
  context,
  cursor,
  enableAudioDebug,
  isLooping,
  lastSyncPoint,
  loadInstrumentSample,
  logAudioDebug,
  loopEnd,
  loopStart,
  revision,
  scheduledNotes,
  scheduleUntilWindow,
  trackChain,
}: ScheduleMidiTrackPlaybackParams) => {
  const loopLength = loopEnd - loopStart;
  let midiStartIndex = 0;

  if (!isLooping || loopLength <= 0) {
    while (
      cursor.midiIndex < compiledTrack.midiNoteEvents.length &&
      compiledTrack.midiNoteEvents[cursor.midiIndex].absoluteEndTime <=
        absoluteCurrentTime
    ) {
      cursor.midiIndex += 1;
    }

    midiStartIndex = cursor.midiIndex;
  }

  for (
    let midiIndex = midiStartIndex;
    midiIndex < compiledTrack.midiNoteEvents.length;
    midiIndex += 1
  ) {
    const noteEvent = compiledTrack.midiNoteEvents[midiIndex];
    const { absoluteEndTime, absoluteStartTime, clip, note, voicePlan } = noteEvent;

    if (!isLooping && absoluteStartTime > scheduleUntilWindow) {
      break;
    }

    if (isLooping && loopLength > 0 && absoluteStartTime >= loopEnd) {
      break;
    }

    const scheduleInstance = (
      monotonicStartTime: number,
      iteration: number,
    ) => {
      const scheduleKey = `${compiledTrack.track.id}:${clip.id}:${note.id}:${revision}:${iteration}`;
      if (scheduledNotes.has(scheduleKey)) {
        return;
      }

      const noteDuration = Math.max(
        MIN_NOTE_DURATION_SECONDS,
        absoluteEndTime - absoluteStartTime,
      );
      const monotonicEndTime = monotonicStartTime + noteDuration;

      if (
        monotonicEndTime <= absoluteCurrentTime ||
        monotonicStartTime > scheduleUntilWindow
      ) {
        return;
      }

      const scheduleVoice = (samplerBuffer: AudioBuffer | null) => {
        const targetStartAt =
          lastSyncPoint.audioTime +
          (monotonicStartTime - lastSyncPoint.sequenceTime);
        const adjustedStartTime = Math.max(context.currentTime, targetStartAt);
        const startDelay = Math.max(0, adjustedStartTime - targetStartAt);
        const playbackOffset =
          Math.max(0, absoluteCurrentTime - monotonicStartTime) + startDelay;
        const remainingDuration = noteDuration - playbackOffset;

        if (remainingDuration <= 0) {
          return;
        }

        const startAt = adjustedStartTime;
        const stopAt =
          startAt + Math.max(MIN_NOTE_DURATION_SECONDS, remainingDuration);

        if (voicePlan.zone && samplerBuffer) {
          const source = context.createBufferSource();
          const noteGain = context.createGain();
          const releaseSeconds = voicePlan.oneShot
            ? Math.min(0.45, samplerBuffer.duration)
            : (voicePlan.releaseSeconds ?? 1.35);
          const attackSeconds = voicePlan.attackSeconds ?? 0.004;
          const decaySeconds = voicePlan.decaySeconds ?? 0.08;
          const sustainLevel = voicePlan.sustainLevel ?? 0.72;
          const sustainGain = Math.max(0.001, voicePlan.gain * sustainLevel);
          const sourceOffset = voicePlan.oneShot
            ? 0
            : Math.min(playbackOffset, Math.max(0, samplerBuffer.duration - 0.01));
          const samplerStopAt = voicePlan.oneShot
            ? startAt + Math.min(samplerBuffer.duration, 2)
            : stopAt + releaseSeconds;
          const attackEnd = startAt + attackSeconds;
          const decayEnd = Math.min(attackEnd + decaySeconds, samplerStopAt);
          const releaseStart = voicePlan.oneShot
            ? Math.min(decayEnd, samplerStopAt)
            : Math.max(decayEnd, stopAt);

          source.buffer = samplerBuffer;
          source.playbackRate.value = voicePlan.playbackRate;

          noteGain.gain.setValueAtTime(0, startAt);
          noteGain.gain.linearRampToValueAtTime(voicePlan.gain, attackEnd);
          noteGain.gain.linearRampToValueAtTime(sustainGain, decayEnd);

          if (voicePlan.oneShot) {
            noteGain.gain.exponentialRampToValueAtTime(
              Math.max(0.12, sustainGain),
              releaseStart,
            );
            noteGain.gain.exponentialRampToValueAtTime(0.001, samplerStopAt);
          } else {
            noteGain.gain.setValueAtTime(sustainGain, releaseStart);
            noteGain.gain.exponentialRampToValueAtTime(
              Math.max(0.05, sustainGain),
              stopAt + releaseSeconds * 0.28,
            );
            noteGain.gain.exponentialRampToValueAtTime(0.001, samplerStopAt);
          }

          source.connect(noteGain);
          noteGain.connect(trackChain.gain);
          source.start(startAt, sourceOffset);
          source.stop(samplerStopAt);

          activeNodes.add(source);

          if (enableAudioDebug) {
            logAudioDebug("scheduled-sampler-note", {
              adjustedStartTime: Number(adjustedStartTime.toFixed(4)),
              noteId: note.id,
              offset: Number(sourceOffset.toFixed(4)),
              pitch: note.pitch,
              remainingDuration: Number(remainingDuration.toFixed(4)),
              scheduleKey,
              trackId: compiledTrack.track.id,
            });
          }

          source.onended = () => {
            activeNodes.delete(source);
            source.disconnect();
            noteGain.disconnect();
          };
          return;
        }

        const osc = context.createOscillator();
        const noteGain = context.createGain();
        const attackSeconds = voicePlan.attackSeconds ?? 0.01;
        const decaySeconds = voicePlan.decaySeconds ?? 0.04;
        const sustainLevel = voicePlan.sustainLevel ?? 0.8;
        const sustainGain = Math.max(0.001, voicePlan.gain * sustainLevel);
        const attackEnd = startAt + attackSeconds;
        const decayEnd = Math.min(attackEnd + decaySeconds, stopAt);

        osc.type = voicePlan.oscillatorType;
        osc.frequency.value = midiNoteToFrequency(note.pitch);

        noteGain.gain.setValueAtTime(0, startAt);
        noteGain.gain.linearRampToValueAtTime(voicePlan.gain, attackEnd);
        noteGain.gain.linearRampToValueAtTime(sustainGain, decayEnd);
        noteGain.gain.setValueAtTime(
          sustainGain,
          Math.max(decayEnd, stopAt - 0.05),
        );
        noteGain.gain.exponentialRampToValueAtTime(0.001, stopAt);

        osc.connect(noteGain);
        noteGain.connect(trackChain.gain);
        osc.start(startAt);
        osc.stop(stopAt);

        activeNodes.add(osc);

        if (enableAudioDebug) {
          logAudioDebug("scheduled-osc-note", {
            adjustedStartTime: Number(adjustedStartTime.toFixed(4)),
            noteId: note.id,
            pitch: note.pitch,
            remainingDuration: Number(remainingDuration.toFixed(4)),
            scheduleKey,
            trackId: compiledTrack.track.id,
          });
        }

        osc.onended = () => {
          activeNodes.delete(osc);
          osc.disconnect();
          noteGain.disconnect();
        };
      };

      scheduledNotes.add(scheduleKey);

      if (voicePlan.zone) {
        void loadInstrumentSample(context, voicePlan.zone.url)
          .then((samplerBuffer) => {
            scheduleVoice(samplerBuffer);
          })
          .catch(() => {
            scheduledNotes.delete(scheduleKey);
          });
        return;
      }

      scheduleVoice(null);
    };

    if (!isLooping || loopLength <= 0) {
      scheduleInstance(absoluteStartTime, 0);
    } else if (absoluteStartTime < loopStart) {
      scheduleInstance(absoluteStartTime, 0);
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
        scheduleInstance(absoluteStartTime + iteration * loopLength, iteration);
      }
    }
  }
};