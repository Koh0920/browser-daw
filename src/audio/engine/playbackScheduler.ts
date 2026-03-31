import { ensureAudioContextRunning } from "@/audio/engine/shared";
import type { CompiledTrackSchedule } from "@/audio/engine/compiledTrackSchedules";
import type { AudioClip, Project } from "@/types";
import type { RefObject } from "react";
import {
  emitTransportTime,
  getTransportCurrentTime,
  setTransportRenderTime,
  useTransportStore,
} from "@/stores/transportStore";
import { recordAudioWorkerTick } from "@/utils/playbackDiagnostics";
import { scheduleAudioTrackPlayback } from "./scheduleAudioTrackPlayback";
import { scheduleMidiTrackPlayback } from "./scheduleMidiTrackPlayback";
import type {
  PlaybackSyncPoint,
  TrackNodeChain,
  TrackScheduleCursor,
} from "./runtimeTypes";

interface PlaybackSchedulerParams {
  worker: Worker;
  context: AudioContext;
  currentProject: Project | null;
  isPlaying: boolean;
  isLooping: boolean;
  loopStart: number;
  loopEnd: number;
  revision: number;
  lookAheadSeconds: number;
  transportSnapshotUpdateIntervalSeconds: number;
  compiledTrackSchedules: CompiledTrackSchedule[];
  playbackSessionRef: RefObject<number>;
  trackNodesRef: RefObject<Map<string, TrackNodeChain>>;
  trackScheduleCursorRef: RefObject<Map<string, TrackScheduleCursor>>;
  scheduledNotesRef: RefObject<Set<string>>;
  pendingSchedulesRef: RefObject<Set<string>>;
  activeNodesRef: RefObject<Set<AudioScheduledSourceNode>>;
  lastTransportSnapshotTimeRef: RefObject<number | null>;
  lastSyncTimeRef: RefObject<PlaybackSyncPoint>;
  loadInstrumentSample: (
    context: AudioContext,
    url: string,
  ) => Promise<AudioBuffer | null>;
  getDecodedClipAudioBuffer: (
    context: AudioContext,
    clip: AudioClip,
  ) => Promise<AudioBuffer | null>;
  preloadAudioBuffersForPlayback: (context: AudioContext) => Promise<void>;
  enableAudioDebug: boolean;
  logAudioDebug: (label: string, payload?: unknown) => void;
}

const stopAllActiveNodes = (activeNodes: Set<AudioScheduledSourceNode>) => {
  activeNodes.forEach((node) => {
    try {
      node.stop();
    } catch {}
  });
  activeNodes.clear();
};

export const createPlaybackScheduler = ({
  activeNodesRef,
  compiledTrackSchedules,
  context,
  currentProject,
  enableAudioDebug,
  getDecodedClipAudioBuffer,
  isLooping,
  isPlaying,
  lastSyncTimeRef,
  lastTransportSnapshotTimeRef,
  loadInstrumentSample,
  logAudioDebug,
  lookAheadSeconds,
  loopEnd,
  loopStart,
  pendingSchedulesRef,
  playbackSessionRef,
  preloadAudioBuffersForPlayback,
  revision,
  scheduledNotesRef,
  trackNodesRef,
  trackScheduleCursorRef,
  transportSnapshotUpdateIntervalSeconds,
  worker,
}: PlaybackSchedulerParams) => {
  const playbackSession = ++playbackSessionRef.current;
  let isCancelled = false;
  let removeMessageListener: (() => void) | null = null;

  if (!isPlaying) {
    worker.postMessage({ command: "stop" });
    stopAllActiveNodes(activeNodesRef.current);
    scheduledNotesRef.current.clear();
    pendingSchedulesRef.current.clear();
    lastTransportSnapshotTimeRef.current = null;
    return () => {};
  }

  const handleTick = () => {
    if (!currentProject || !isPlaying) {
      return;
    }

    recordAudioWorkerTick();

    const now = context.currentTime;
    const elapsedAudioTime = now - lastSyncTimeRef.current.audioTime;
    const absoluteCurrentTime =
      lastSyncTimeRef.current.sequenceTime + elapsedAudioTime;
    const scheduleUntilWindow = absoluteCurrentTime + lookAheadSeconds;
    const loopLength = loopEnd - loopStart;

    if (absoluteCurrentTime >= currentProject.duration) {
      useTransportStore.getState().stop();
      return;
    }

    setTransportRenderTime(absoluteCurrentTime);

    const lastTransportSnapshotTime =
      lastTransportSnapshotTimeRef.current ?? -Infinity;
    if (
      absoluteCurrentTime - lastTransportSnapshotTime >=
      transportSnapshotUpdateIntervalSeconds
    ) {
      useTransportStore.getState().commitCurrentTime(absoluteCurrentTime);
      emitTransportTime();
      lastTransportSnapshotTimeRef.current = absoluteCurrentTime;
    }

    if (enableAudioDebug) {
      logAudioDebug("tick", {
        audioContextState: context.state,
        audioTime: Number(now.toFixed(4)),
        currentTime: Number(getTransportCurrentTime().toFixed(4)),
        isPlaying,
        loopEnd,
        loopStart,
        projectDuration: currentProject.duration,
        revision,
        scheduledNotes: scheduledNotesRef.current.size,
        sequenceTime: Number(absoluteCurrentTime.toFixed(4)),
      });
    }

    for (const compiledTrack of compiledTrackSchedules) {
      const { track } = compiledTrack;
      const trackChain = trackNodesRef.current.get(track.id);
      if (!trackChain) {
        continue;
      }

      const cursor = trackScheduleCursorRef.current.get(track.id) ?? {
        audioIndex: 0,
        midiIndex: 0,
      };
      trackScheduleCursorRef.current.set(track.id, cursor);

      if (track.type === "audio") {
        scheduleAudioTrackPlayback({
          compiledTrack,
          context,
          trackChain,
          cursor,
          absoluteCurrentTime,
          scheduleUntilWindow,
          isLooping,
          loopStart,
          loopEnd,
          revision,
          lastSyncPoint: lastSyncTimeRef.current,
          scheduledNotes: scheduledNotesRef.current,
          pendingSchedules: pendingSchedulesRef.current,
          activeNodes: activeNodesRef.current,
          playbackSession,
          getCurrentPlaybackSession: () => playbackSessionRef.current,
          getDecodedClipAudioBuffer,
        });
        continue;
      }

      scheduleMidiTrackPlayback({
        compiledTrack,
        context,
        trackChain,
        cursor,
        absoluteCurrentTime,
        scheduleUntilWindow,
        isLooping,
        loopStart,
        loopEnd,
        revision,
        lastSyncPoint: lastSyncTimeRef.current,
        scheduledNotes: scheduledNotesRef.current,
        activeNodes: activeNodesRef.current,
        loadInstrumentSample,
        enableAudioDebug,
        logAudioDebug,
      });
    }
  };

  const onMessage = (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type !== "tick" || isCancelled) {
      return;
    }

    handleTick();
  };

  const startPlayback = async () => {
    await ensureAudioContextRunning(context);
    await preloadAudioBuffersForPlayback(context);

    if (isCancelled) {
      return;
    }

    lastSyncTimeRef.current = {
      audioTime: context.currentTime,
      sequenceTime: getTransportCurrentTime(),
    };

    if (enableAudioDebug) {
      logAudioDebug("start-playback", {
        audioContextState: context.state,
        currentTime: Number(getTransportCurrentTime().toFixed(4)),
        isPlaying,
        projectId: currentProject?.id,
        revision,
        trackCount: currentProject?.tracks.length ?? 0,
      });
    }

    worker.postMessage({ command: "start" });
    worker.addEventListener("message", onMessage);
    removeMessageListener = () => {
      worker.removeEventListener("message", onMessage);
    };
    handleTick();
  };

  void startPlayback();

  return () => {
    isCancelled = true;
    removeMessageListener?.();
  };
};

export const resetPlaybackRuntimeState = (
  activeNodesRef: RefObject<Set<AudioScheduledSourceNode>>,
  scheduledNotesRef: RefObject<Set<string>>,
  pendingSchedulesRef: RefObject<Set<string>>,
) => {
  stopAllActiveNodes(activeNodesRef.current);
  scheduledNotesRef.current.clear();
  pendingSchedulesRef.current.clear();
};