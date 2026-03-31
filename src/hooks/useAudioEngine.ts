import { useEffect, useMemo, useRef } from "react";
import { AUDIO_CONTEXT_UNLOCK_EVENT } from "@/audio/audioContextEvents";
import {
  collectProjectInstrumentSampleUrls,
  createAudioBufferDecoder,
  createFetchAudioAssetSource,
  getDecodedAssetBuffer,
  preloadAudioAssets,
} from "@/audio/engine/audioAssetManager";
import {
  buildCompiledTrackSchedules,
  type CompiledTrackSchedule,
} from "@/audio/engine/compiledTrackSchedules";
import { createLiveMidiSubscription } from "@/audio/engine/liveMidiSubscription";
import {
  createPlaybackScheduler,
  resetPlaybackRuntimeState,
} from "@/audio/engine/playbackScheduler";
import type {
  LiveNoteInstance,
  TrackNodeChain,
  TrackScheduleCursor,
} from "@/audio/engine/runtimeTypes";
import {
  ensureAudioContextRunning,
} from "@/audio/engine/shared";
import { useProjectStore } from "@/stores/projectStore";
import {
  getTransportCurrentTime,
} from "@/stores/transportStore";
import { readAudioAsset } from "@/utils/audioStorage";
import type { AudioClip } from "@/types";
import { useTransport } from "./useTransport";

const LOOK_AHEAD_SECONDS = 0.5;
const ENABLE_AUDIO_DEBUG = false;
const TRANSPORT_SNAPSHOT_UPDATE_INTERVAL_SECONDS = 0.1;
const AUDIO_DEBUG_PREFIX = "[AudioEngine]";
// WorkerのTick間隔より少し長めにとることで、余裕を持ってスケジュールします

const logAudioDebug = (label: string, payload?: unknown) => {
  if (!ENABLE_AUDIO_DEBUG) {
    return;
  }

  void label;
  void payload;
  // if (payload === undefined) {
  //   console.log(AUDIO_DEBUG_PREFIX, label);
  //   return;
  // }

  // console.log(AUDIO_DEBUG_PREFIX, label, payload);
};

const sampleAssetSource = createFetchAudioAssetSource();
const sampleAudioBufferDecoder = createAudioBufferDecoder();

export const useAudioEngine = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const {
    isMasterMuted,
    isPlaying,
    isLooping,
    loopEnd,
    loopStart,
    masterVolume,
    revision,
  } = useTransport();

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<Map<string, TrackNodeChain>>(new Map());
  const scheduledNotesRef = useRef<Set<string>>(new Set());
  const pendingSchedulesRef = useRef<Set<string>>(new Set());
  const activeNodesRef = useRef<Set<AudioScheduledSourceNode>>(new Set());
  const decodedAudioBufferCacheRef = useRef<
    WeakMap<ArrayBuffer, Promise<AudioBuffer | null>>
  >(new WeakMap());
  const decodedAudioAssetCacheRef = useRef<
    Map<string, Promise<AudioBuffer | null>>
  >(new Map());
  const playbackSessionRef = useRef(0);
  const trackScheduleCursorRef = useRef<
    Map<string, TrackScheduleCursor>
  >(new Map());
  const currentProjectRef = useRef(currentProject);
  const lastTransportSnapshotTimeRef = useRef<number | null>(null);
  const liveDesiredNotesRef = useRef<Set<string>>(new Set());
  const liveNoteInstancesRef = useRef<Map<string, LiveNoteInstance>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const wasPlayingRef = useRef(false);

  const loadInstrumentSample = (context: AudioContext, url: string) => {
    return getDecodedAssetBuffer(
      context,
      url,
      sampleAssetSource,
      sampleAudioBufferDecoder,
    );
  };

  // ★ 追加: 再生・シークした瞬間の「Audioの時計」と「シーケンスの時計」を記録するRef
  const lastSyncTimeRef = useRef({ audioTime: 0, sequenceTime: 0 });

  const getDecodedAudioBuffer = (
    context: AudioContext,
    audioData?: ArrayBuffer,
  ) => {
    if (!audioData) {
      return Promise.resolve(null);
    }

    const cached = decodedAudioBufferCacheRef.current.get(audioData);
    if (cached) {
      return cached;
    }

    const decodePromise = context
      .decodeAudioData(audioData.slice(0))
      .catch((error) => {
        console.error("Failed to decode audio clip", error);
        return null;
      });

    decodedAudioBufferCacheRef.current.set(audioData, decodePromise);
    return decodePromise;
  };

  const getDecodedClipAudioBuffer = (context: AudioContext, clip: AudioClip) => {
    if (clip.audioData) {
      return getDecodedAudioBuffer(context, clip.audioData);
    }

    if (!clip.audioAssetPath) {
      return Promise.resolve(null);
    }

    const cached = decodedAudioAssetCacheRef.current.get(clip.audioAssetPath);
    if (cached) {
      return cached;
    }

    const decodePromise = readAudioAsset(clip.audioAssetPath)
      .then((audioData) => {
        if (!audioData) {
          return null;
        }

        return context.decodeAudioData(audioData.slice(0));
      })
      .catch((error) => {
        console.error("Failed to decode stored audio clip", error);
        decodedAudioAssetCacheRef.current.delete(clip.audioAssetPath!);
        return null;
      });

    decodedAudioAssetCacheRef.current.set(clip.audioAssetPath, decodePromise);
    return decodePromise;
  };

  const preloadAudioBuffersForPlayback = async (context: AudioContext) => {
    const preloadPromises: Array<Promise<AudioBuffer | null>> = [];

    preloadPromises.push(
      ...Array.from(collectProjectInstrumentSampleUrls(currentProject ?? { tracks: [] } as never), (url) =>
        loadInstrumentSample(context, url),
      ),
    );

    compiledTrackSchedules.forEach(({ audioClipEvents }) => {
      audioClipEvents.forEach(({ clip }) => {
        if (clip.audioData || clip.audioAssetPath) {
          preloadPromises.push(getDecodedClipAudioBuffer(context, clip));
        }
      });
    });

    if (preloadPromises.length === 0) {
      return;
    }

    await Promise.all(preloadPromises);
  };

  const stopLiveNote = (liveNoteId: string, when?: number) => {
    liveDesiredNotesRef.current.delete(liveNoteId);

    const liveInstance = liveNoteInstancesRef.current.get(liveNoteId);
    if (!liveInstance) {
      return;
    }

    liveNoteInstancesRef.current.delete(liveNoteId);
    liveInstance.stop(when);
  };

  const stopAllLiveNotes = (trackId?: string) => {
    liveDesiredNotesRef.current.forEach((liveNoteId) => {
      if (!trackId || liveNoteId.startsWith(`${trackId}:`)) {
        liveDesiredNotesRef.current.delete(liveNoteId);
      }
    });

    Array.from(liveNoteInstancesRef.current.entries()).forEach(
      ([liveNoteId, liveInstance]) => {
        if (trackId && liveInstance.trackId !== trackId) {
          return;
        }

        liveNoteInstancesRef.current.delete(liveNoteId);
        liveInstance.stop();
      },
    );
  };

  const trackMixerState = useMemo(() => {
    if (!currentProject) return new Map();
    const hasSolo = currentProject.tracks.some((t) => t.solo);
    return new Map(
      currentProject.tracks.map((track) => {
        let effectiveVolume = track.volume;
        if (track.muted) effectiveVolume = 0;
        else if (hasSolo && !track.solo) effectiveVolume = 0;
        return [track.id, effectiveVolume];
      }),
    );
  }, [currentProject]);

  const compiledTrackSchedules = useMemo<CompiledTrackSchedule[]>(
    () => buildCompiledTrackSchedules(currentProject),
    [currentProject],
  );

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    const nextCursors = new Map<
      string,
      { audioIndex: number; midiIndex: number }
    >();

    compiledTrackSchedules.forEach(({ track }) => {
      nextCursors.set(track.id, { audioIndex: 0, midiIndex: 0 });
    });

    trackScheduleCursorRef.current = nextCursors;
  }, [compiledTrackSchedules, revision]);

  // AudioContext と Worker の初期化
  useEffect(() => {
    const context = new AudioContext();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(context.destination);

    if (ENABLE_AUDIO_DEBUG) {
      logAudioDebug("init", {
        audioContextState: context.state,
      });
    }

    audioContextRef.current = context;
    masterGainRef.current = masterGain;

    const worker = new Worker(
      new URL("../audio/audioWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const unlockEvents: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "mousedown",
      "touchstart",
      "keydown",
      "click",
    ];

    const removeUnlockListeners = () => {
      unlockEvents.forEach((eventName) => {
        document.removeEventListener(eventName, unlockAudioContext);
      });
    };

    const unlockAudioContext = () => {
      void ensureAudioContextRunning(context).then((didResume) => {
        if (didResume) {
          removeUnlockListeners();
        }
      });
    };

    const handleExplicitUnlockRequest = () => {
      unlockAudioContext();
    };

    unlockEvents.forEach((eventName) => {
      document.addEventListener(eventName, unlockAudioContext);
    });
    window.addEventListener(
      AUDIO_CONTEXT_UNLOCK_EVENT,
      handleExplicitUnlockRequest,
    );

    return () => {
      removeUnlockListeners();
      window.removeEventListener(
        AUDIO_CONTEXT_UNLOCK_EVENT,
        handleExplicitUnlockRequest,
      );
      worker.terminate();

      activeNodesRef.current.forEach((node) => {
        try {
          node.stop();
        } catch (e) {}
      });
      activeNodesRef.current.clear();
      stopAllLiveNotes();

      trackNodesRef.current.forEach(({ gain, panner }) => {
        gain.disconnect();
        panner.disconnect();
      });
      trackNodesRef.current.clear();
      scheduledNotesRef.current.clear();
      pendingSchedulesRef.current.clear();

      void context.close();
    };
  }, []);

  useEffect(() => {
    const context = audioContextRef.current;
    const masterGain = masterGainRef.current;
    if (!context || !masterGain) {
      return;
    }

    const targetGain = isMasterMuted ? 0 : masterVolume;
    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime);
    masterGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.015);
  }, [isMasterMuted, masterVolume]);

  // Track Nodes (GainNodes) の同期
  useEffect(() => {
    const context = audioContextRef.current;
    const masterGain = masterGainRef.current;
    if (!context || !masterGain || !currentProject) return;

    currentProject.tracks.forEach((track) => {
      if (!trackNodesRef.current.has(track.id)) {
        const gain = context.createGain();
        const panner = context.createStereoPanner();

        gain.connect(panner);
        panner.connect(masterGain);
        trackNodesRef.current.set(track.id, { gain, panner });
      }

      const trackChain = trackNodesRef.current.get(track.id)!;
      const targetVolume = trackMixerState.get(track.id) ?? 0;

      trackChain.gain.gain.setValueAtTime(
        trackChain.gain.gain.value,
        context.currentTime,
      );
      trackChain.gain.gain.setTargetAtTime(
        targetVolume * 0.2,
        context.currentTime,
        0.02,
      );
      trackChain.panner.pan.setValueAtTime(
        trackChain.panner.pan.value,
        context.currentTime,
      );
      trackChain.panner.pan.setTargetAtTime(
        track.pan,
        context.currentTime,
        0.02,
      );
    });

    const trackIds = new Set(currentProject.tracks.map((t) => t.id));
    trackNodesRef.current.forEach((node, id) => {
      if (!trackIds.has(id)) {
        stopAllLiveNotes(id);
        node.gain.disconnect();
        node.panner.disconnect();
        trackNodesRef.current.delete(id);
      }
    });
  }, [currentProject, trackMixerState]);

  useEffect(() => {
    return createLiveMidiSubscription({
      audioContextRef,
      currentProjectRef,
      trackNodesRef,
      liveDesiredNotesRef,
      liveNoteInstancesRef,
      activeNodesRef,
      loadInstrumentSample,
      stopAllLiveNotes,
      stopLiveNote,
    });
  }, []);

  // ★ 追加: シークや再生開始時に、マスタークロックの基準位置を記録
  useEffect(() => {
    if (audioContextRef.current) {
      const sequenceTime = getTransportCurrentTime();
      lastSyncTimeRef.current = {
        audioTime: audioContextRef.current.currentTime,
        sequenceTime,
      };
    }
  }, [isPlaying, revision]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context || !currentProject) return;

    currentProject.tracks.forEach((track) => {
      if (track.type !== "audio") return;

      track.clips.forEach((clip) => {
        if (clip.audioData || clip.audioAssetPath) {
          void getDecodedClipAudioBuffer(context, clip);
        }
      });
    });
  }, [currentProject]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context || !currentProject) return;

    void preloadAudioAssets(
      collectProjectInstrumentSampleUrls(currentProject),
      sampleAssetSource,
    );
  }, [currentProject]);

  // Playback State & Scheduling
  useEffect(() => {
    const worker = workerRef.current;
    const context = audioContextRef.current;
    if (!worker || !context) {
      return;
    }

    return createPlaybackScheduler({
      worker,
      context,
      currentProject,
      isPlaying,
      isLooping,
      loopStart,
      loopEnd,
      revision,
      lookAheadSeconds: LOOK_AHEAD_SECONDS,
      transportSnapshotUpdateIntervalSeconds:
        TRANSPORT_SNAPSHOT_UPDATE_INTERVAL_SECONDS,
      compiledTrackSchedules,
      playbackSessionRef,
      trackNodesRef,
      trackScheduleCursorRef,
      scheduledNotesRef,
      pendingSchedulesRef,
      activeNodesRef,
      lastTransportSnapshotTimeRef,
      lastSyncTimeRef,
      loadInstrumentSample,
      getDecodedClipAudioBuffer,
      preloadAudioBuffersForPlayback,
      enableAudioDebug: ENABLE_AUDIO_DEBUG,
      logAudioDebug,
    });
  }, [isPlaying, currentProject, revision, isLooping, loopStart, loopEnd]);

  // シーク時（revision変更時）のクリーンアップ
  useEffect(() => {
    if (!isPlaying || !wasPlayingRef.current) {
      return;
    }

    playbackSessionRef.current += 1;
    resetPlaybackRuntimeState(
      activeNodesRef,
      scheduledNotesRef,
      pendingSchedulesRef,
    );
  }, [revision]);

  useEffect(() => {
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, revision]);

  return { audioContext: audioContextRef.current };
};
