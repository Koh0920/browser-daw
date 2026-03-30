import { useEffect, useMemo, useRef } from "react";
import { AUDIO_CONTEXT_UNLOCK_EVENT } from "@/audio/audioContextEvents";
import {
  findNearestSampleZone,
  getInstrumentDefinition,
} from "@/audio/instruments";
import { useProjectStore } from "@/stores/projectStore";
import { readAudioAsset } from "@/utils/audioStorage";
import type { MidiClip } from "@/types";
import { useTransport } from "./useTransport";

const LOOK_AHEAD_SECONDS = 0.2;
const MIN_NOTE_DURATION_SECONDS = 0.05;
const SAMPLER_RELEASE_SECONDS = 1.35;
const AUDIO_DEBUG_PREFIX = "[AudioEngine]";
// WorkerのTick間隔より少し長めにとることで、余裕を持ってスケジュールします

const logAudioDebug = (label: string, payload?: unknown) => {
  void label;
  void payload;
  // if (payload === undefined) {
  //   console.log(AUDIO_DEBUG_PREFIX, label);
  //   return;
  // }
  //
  // console.log(AUDIO_DEBUG_PREFIX, label, payload);
};

const midiNoteToFrequency = (note: number) =>
  440 * Math.pow(2, (note - 69) / 12);
const ensureAudioContextRunning = async (context: AudioContext) => {
  if (context.state === "running") {
    return true;
  }

  try {
    await context.resume();
  } catch (error) {
    console.error("AudioContext resume failed", error);
    return false;
  }

  const nextState = context.state as AudioContextState;
  return nextState === "running";
};

const getNormalizedVelocity = (velocity: number) => {
  const normalized = Math.min(1, Math.max(0.08, velocity / 127));
  return Math.pow(normalized, 0.72);
};
const instrumentCache = new Map<string, AudioBuffer>();
const instrumentLoadCache = new Map<string, Promise<AudioBuffer | null>>();

const loadInstrumentSample = async (context: AudioContext, url: string) => {
  const cachedBuffer = instrumentCache.get(url);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const pendingLoad = instrumentLoadCache.get(url);
  if (pendingLoad) {
    return pendingLoad;
  }

  const loadPromise = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch sample ${url}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      instrumentCache.set(url, audioBuffer);
      instrumentLoadCache.delete(url);
      return audioBuffer;
    })
    .catch((error) => {
      instrumentLoadCache.delete(url);
      console.error(`Failed to load sample: ${url}`, error);
      return null;
    });

  instrumentLoadCache.set(url, loadPromise);
  return loadPromise;
};

const getAudioClipPlaybackDuration = (
  clipDuration: number,
  bufferDuration: number,
) => {
  if (clipDuration > 0) {
    return Math.min(clipDuration, bufferDuration);
  }

  return bufferDuration;
};

interface TrackNodeChain {
  gain: GainNode;
  panner: StereoPannerNode;
}

export const useAudioEngine = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  // ★ isLooping, loopStart, loopEnd を追加で取得します
  const {
    currentTime,
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
  const workerRef = useRef<Worker | null>(null);
  const wasPlayingRef = useRef(false);

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

  const getDecodedClipAudioBuffer = (context: AudioContext, clip: MidiClip) => {
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

  // AudioContext と Worker の初期化
  useEffect(() => {
    const context = new AudioContext();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(context.destination);

    logAudioDebug("init", {
      audioContextState: context.state,
    });

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
        node.gain.disconnect();
        node.panner.disconnect();
        trackNodesRef.current.delete(id);
      }
    });
  }, [currentProject, trackMixerState]);

  // ★ 追加: シークや再生開始時に、マスタークロックの基準位置を記録
  useEffect(() => {
    if (audioContextRef.current) {
      lastSyncTimeRef.current = {
        audioTime: audioContextRef.current.currentTime,
        sequenceTime: currentTime,
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

    currentProject.tracks.forEach((track) => {
      if (track.type !== "midi") {
        return;
      }

      const instrumentDefinition = getInstrumentDefinition(
        track.instrument.patchId,
      );
      if (
        instrumentDefinition.type === "sampler" &&
        instrumentDefinition.zones?.length
      ) {
        instrumentDefinition.zones.forEach((zone) => {
          void loadInstrumentSample(context, zone.url);
        });
      }
    });
  }, [currentProject]);

  // Playback State & Scheduling
  useEffect(() => {
    const worker = workerRef.current;
    const context = audioContextRef.current;
    if (!worker || !context) return;

    const playbackSession = ++playbackSessionRef.current;
    let isCancelled = false;
    let removeMessageListener: (() => void) | null = null;

    if (!isPlaying) {
      worker.postMessage({ command: "stop" });
      activeNodesRef.current.forEach((node) => {
        try {
          node.stop();
        } catch (e) {}
      });
      activeNodesRef.current.clear();
      scheduledNotesRef.current.clear();
      pendingSchedulesRef.current.clear();
      return;
    }

    const handleTick = () => {
      if (!currentProject || !isPlaying) return;

      const now = context.currentTime;

      // 現在のAudio経過時間から、モノトニック（単調増加）なシーケンス時間を計算
      const elapsedAudioTime = now - lastSyncTimeRef.current.audioTime;
      const absoluteCurrentTime =
        lastSyncTimeRef.current.sequenceTime + elapsedAudioTime;
      const scheduleUntilWindow = absoluteCurrentTime + LOOK_AHEAD_SECONDS;
      const loopLength = loopEnd - loopStart;

      logAudioDebug("tick", {
        audioContextState: context.state,
        audioTime: Number(now.toFixed(4)),
        currentTime: Number(currentTime.toFixed(4)),
        isPlaying,
        loopEnd,
        loopStart,
        projectDuration: currentProject.duration,
        revision,
        scheduledNotes: scheduledNotesRef.current.size,
        sequenceTime: Number(absoluteCurrentTime.toFixed(4)),
      });

      currentProject.tracks.forEach((track) => {
        const trackChain = trackNodesRef.current.get(track.id);
        if (!trackChain) return;

        track.clips.forEach((clip) => {
          if (track.type === "audio") {
            const scheduleAudioClipInstance = async (
              monotonicStartTime: number,
              iteration: number,
            ) => {
              if (!clip.audioData && !clip.audioAssetPath) return;

              const scheduleKey = `${track.id}:${clip.id}:audio:${revision}:${iteration}`;
              if (
                scheduledNotesRef.current.has(scheduleKey) ||
                pendingSchedulesRef.current.has(scheduleKey)
              )
                return;

              pendingSchedulesRef.current.add(scheduleKey);

              try {
                const audioBuffer = await getDecodedClipAudioBuffer(
                  context,
                  clip,
                );
                if (
                  !audioBuffer ||
                  playbackSession !== playbackSessionRef.current
                )
                  return;

                const clipOffset = clip.audioOffset ?? 0;
                const availableDuration = Math.max(
                  0,
                  audioBuffer.duration - clipOffset,
                );
                const playbackDuration = getAudioClipPlaybackDuration(
                  clip.duration,
                  availableDuration,
                );
                const clipEndTime = monotonicStartTime + playbackDuration;

                if (
                  playbackDuration <= 0 ||
                  clipEndTime <= absoluteCurrentTime ||
                  monotonicStartTime > scheduleUntilWindow
                )
                  return;

                const targetStartAt =
                  lastSyncTimeRef.current.audioTime +
                  (monotonicStartTime - lastSyncTimeRef.current.sequenceTime);
                const actualStartAt = Math.max(
                  context.currentTime,
                  targetStartAt,
                );
                const startDelay = Math.max(0, actualStartAt - targetStartAt);
                const clipProgress =
                  Math.max(0, absoluteCurrentTime - monotonicStartTime) +
                  startDelay;
                const playbackOffset = clipOffset + clipProgress;
                const remainingDuration = playbackDuration - clipProgress;

                if (remainingDuration <= 0) return;

                const source = context.createBufferSource();
                const clipGain = context.createGain();

                source.buffer = audioBuffer;
                source.connect(clipGain);
                clipGain.connect(trackChain.gain);

                source.start(actualStartAt, playbackOffset, remainingDuration);

                activeNodesRef.current.add(source);
                scheduledNotesRef.current.add(scheduleKey);

                source.onended = () => {
                  activeNodesRef.current.delete(source);
                  source.disconnect();
                  clipGain.disconnect();
                };
              } finally {
                pendingSchedulesRef.current.delete(scheduleKey);
              }
            };

            const absoluteStartTime = clip.startTime;

            if (!isLooping || loopLength <= 0) {
              void scheduleAudioClipInstance(absoluteStartTime, 0);
            } else {
              if (absoluteStartTime < loopStart) {
                void scheduleAudioClipInstance(absoluteStartTime, 0);
              } else if (
                absoluteStartTime >= loopStart &&
                absoluteStartTime < loopEnd
              ) {
                const minIter = Math.max(
                  0,
                  Math.floor(
                    (absoluteCurrentTime - absoluteStartTime) / loopLength,
                  ),
                );
                const maxIter = Math.max(
                  0,
                  Math.ceil(
                    (scheduleUntilWindow - absoluteStartTime) / loopLength,
                  ),
                );

                for (let i = minIter; i <= maxIter; i++) {
                  void scheduleAudioClipInstance(
                    absoluteStartTime + i * loopLength,
                    i,
                  );
                }
              }
            }

            return;
          }

          clip.notes.forEach((note) => {
            const absoluteStartTime = clip.startTime + note.startTime;
            const absoluteEndTime = absoluteStartTime + note.duration;

            const scheduleInstance = (
              monotonicStartTime: number,
              iteration: number,
            ) => {
              if (
                absoluteEndTime <= absoluteCurrentTime ||
                monotonicStartTime > scheduleUntilWindow
              )
                return;

              const scheduleKey = `${track.id}:${clip.id}:${note.id}:${revision}:${iteration}`;
              if (scheduledNotesRef.current.has(scheduleKey)) return;

              const playbackOffset = Math.max(
                0,
                absoluteCurrentTime - monotonicStartTime,
              );
              const remainingDuration = Math.max(
                MIN_NOTE_DURATION_SECONDS,
                note.duration - playbackOffset,
              );
              const adjustedStartTime = Math.max(
                monotonicStartTime,
                absoluteCurrentTime,
              );

              const startAt =
                lastSyncTimeRef.current.audioTime +
                (adjustedStartTime - lastSyncTimeRef.current.sequenceTime);
              const stopAt = Math.max(
                startAt + MIN_NOTE_DURATION_SECONDS,
                startAt + remainingDuration,
              );
              const velocity = getNormalizedVelocity(note.velocity);
              const instrumentDefinition = getInstrumentDefinition(
                track.instrument.patchId,
              );
              const selectedZone =
                instrumentDefinition.type === "sampler" &&
                instrumentDefinition.zones?.length
                  ? findNearestSampleZone(
                      note.pitch,
                      instrumentDefinition.zones,
                    )
                  : null;
              const samplerBuffer = selectedZone
                ? instrumentCache.get(selectedZone.url)
                : null;

              if (selectedZone && !samplerBuffer) {
                void loadInstrumentSample(context, selectedZone.url);
              }

              if (selectedZone && samplerBuffer) {
                const source = context.createBufferSource();
                const noteGain = context.createGain();
                const releaseSeconds = instrumentDefinition.oneShot
                  ? Math.min(0.45, samplerBuffer.duration)
                  : SAMPLER_RELEASE_SECONDS;
                const sourceOffset = instrumentDefinition.oneShot
                  ? 0
                  : Math.min(
                      playbackOffset,
                      Math.max(0, samplerBuffer.duration - 0.01),
                    );
                const samplerStopAt = instrumentDefinition.oneShot
                  ? startAt + Math.min(samplerBuffer.duration, 2)
                  : stopAt + releaseSeconds;
                const holdUntil = instrumentDefinition.oneShot
                  ? Math.min(startAt + 0.03, samplerStopAt)
                  : Math.max(startAt + 0.012, stopAt - 0.18);

                source.buffer = samplerBuffer;
                source.playbackRate.value =
                  instrumentDefinition.pitchTracking === false
                    ? 1
                    : Math.pow(2, (note.pitch - selectedZone.pitch) / 12);

                noteGain.gain.setValueAtTime(0, startAt);
                noteGain.gain.linearRampToValueAtTime(
                  velocity,
                  startAt + (instrumentDefinition.oneShot ? 0.002 : 0.004),
                );

                if (instrumentDefinition.oneShot) {
                  noteGain.gain.exponentialRampToValueAtTime(
                    Math.max(0.12, velocity * 0.55),
                    holdUntil,
                  );
                  noteGain.gain.exponentialRampToValueAtTime(
                    0.001,
                    samplerStopAt,
                  );
                } else {
                  noteGain.gain.setValueAtTime(velocity, holdUntil);
                  noteGain.gain.exponentialRampToValueAtTime(
                    Math.max(0.05, velocity * 0.55),
                    stopAt + releaseSeconds * 0.28,
                  );
                  noteGain.gain.exponentialRampToValueAtTime(
                    0.001,
                    samplerStopAt,
                  );
                }

                source.connect(noteGain);
                noteGain.connect(trackChain.gain);

                source.start(startAt, sourceOffset);
                source.stop(samplerStopAt);

                activeNodesRef.current.add(source);
                scheduledNotesRef.current.add(scheduleKey);

                logAudioDebug("scheduled-sampler-note", {
                  adjustedStartTime: Number(adjustedStartTime.toFixed(4)),
                  noteId: note.id,
                  offset: Number(sourceOffset.toFixed(4)),
                  pitch: note.pitch,
                  remainingDuration: Number(remainingDuration.toFixed(4)),
                  scheduleKey,
                  trackId: track.id,
                });

                source.onended = () => {
                  activeNodesRef.current.delete(source);
                  source.disconnect();
                  noteGain.disconnect();
                };
                return;
              }

              const osc = context.createOscillator();
              const noteGain = context.createGain();

              osc.type = "triangle";
              osc.frequency.value = midiNoteToFrequency(note.pitch);

              noteGain.gain.setValueAtTime(0, startAt);
              noteGain.gain.linearRampToValueAtTime(velocity, startAt + 0.01);
              noteGain.gain.setValueAtTime(
                velocity,
                Math.max(startAt + 0.01, stopAt - 0.05),
              );
              noteGain.gain.exponentialRampToValueAtTime(0.001, stopAt);

              osc.connect(noteGain);
              noteGain.connect(trackChain.gain);

              osc.start(startAt);
              osc.stop(stopAt);

              activeNodesRef.current.add(osc);
              scheduledNotesRef.current.add(scheduleKey);

              logAudioDebug("scheduled-osc-note", {
                adjustedStartTime: Number(adjustedStartTime.toFixed(4)),
                noteId: note.id,
                pitch: note.pitch,
                remainingDuration: Number(remainingDuration.toFixed(4)),
                scheduleKey,
                trackId: track.id,
              });

              osc.onended = () => {
                activeNodesRef.current.delete(osc);
                osc.disconnect();
                noteGain.disconnect();
              };
            };

            if (!isLooping || loopLength <= 0) {
              scheduleInstance(absoluteStartTime, 0);
            } else {
              if (absoluteStartTime < loopStart) {
                scheduleInstance(absoluteStartTime, 0);
              } else if (
                absoluteStartTime >= loopStart &&
                absoluteStartTime < loopEnd
              ) {
                const minIter = Math.max(
                  0,
                  Math.floor(
                    (absoluteCurrentTime - absoluteStartTime) / loopLength,
                  ),
                );
                const maxIter = Math.max(
                  0,
                  Math.ceil(
                    (scheduleUntilWindow - absoluteStartTime) / loopLength,
                  ),
                );

                for (let i = minIter; i <= maxIter; i++) {
                  scheduleInstance(absoluteStartTime + i * loopLength, i);
                }
              }
            }
          });
        });
      });
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data.type === "tick") handleTick();
    };

    const startPlayback = async () => {
      const didResume = await ensureAudioContextRunning(context);
      if (
        !didResume ||
        isCancelled ||
        playbackSession !== playbackSessionRef.current
      ) {
        logAudioDebug("start-playback-aborted", {
          audioContextState: context.state,
          didResume,
          isCancelled,
          playbackSession,
          sessionRef: playbackSessionRef.current,
        });
        return;
      }

      logAudioDebug("start-playback", {
        audioContextState: context.state,
        currentTime: Number(currentTime.toFixed(4)),
        isPlaying,
        projectId: currentProject?.id,
        revision,
        trackCount: currentProject?.tracks.length ?? 0,
      });

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
      if (removeMessageListener) {
        removeMessageListener();
      }
    };
  }, [isPlaying, currentProject, revision, isLooping, loopStart, loopEnd]);

  // シーク時（revision変更時）のクリーンアップ
  useEffect(() => {
    if (!isPlaying || !wasPlayingRef.current) {
      return;
    }

    playbackSessionRef.current += 1;
    activeNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    activeNodesRef.current.clear();
    scheduledNotesRef.current.clear();
    pendingSchedulesRef.current.clear();
  }, [revision]);

  useEffect(() => {
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, revision]);

  return { audioContext: audioContextRef.current };
};
