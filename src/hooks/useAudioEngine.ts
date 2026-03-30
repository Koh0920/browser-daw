import { useEffect, useMemo, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useTransport } from "./useTransport";

const LOOK_AHEAD_SECONDS = 0.2;
const MIN_NOTE_DURATION_SECONDS = 0.05;
// WorkerのTick間隔より少し長めにとることで、余裕を持ってスケジュールします

const midiNoteToFrequency = (note: number) =>
  440 * Math.pow(2, (note - 69) / 12);
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
  const { currentTime, isPlaying, revision, isLooping, loopStart, loopEnd } =
    useTransport();

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<Map<string, TrackNodeChain>>(new Map());
  const scheduledNotesRef = useRef<Set<string>>(new Set());
  const pendingSchedulesRef = useRef<Set<string>>(new Set());
  const activeNodesRef = useRef<Set<AudioScheduledSourceNode>>(new Set());
  const decodedAudioBufferCacheRef = useRef<
    WeakMap<ArrayBuffer, Promise<AudioBuffer | null>>
  >(new WeakMap());
  const playbackSessionRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

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

    audioContextRef.current = context;
    masterGainRef.current = masterGain;

    const worker = new Worker(
      new URL("../audio/audioWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const unlockAudioContext = () => {
      if (context.state === "suspended") {
        void context.resume();
      }
    };
    document.addEventListener("click", unlockAudioContext, { once: true });

    return () => {
      document.removeEventListener("click", unlockAudioContext);
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
        if (clip.audioData) {
          void getDecodedAudioBuffer(context, clip.audioData);
        }
      });
    });
  }, [currentProject]);

  // Playback State & Scheduling
  useEffect(() => {
    const worker = workerRef.current;
    const context = audioContextRef.current;
    if (!worker || !context) return;

    const playbackSession = ++playbackSessionRef.current;

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

    if (context.state === "suspended") {
      void context.resume();
    }

    worker.postMessage({ command: "start" });

    const handleTick = () => {
      if (!currentProject || !isPlaying) return;

      const now = context.currentTime;

      // 現在のAudio経過時間から、モノトニック（単調増加）なシーケンス時間を計算
      const elapsedAudioTime = now - lastSyncTimeRef.current.audioTime;
      const absoluteCurrentTime =
        lastSyncTimeRef.current.sequenceTime + elapsedAudioTime;
      const scheduleUntilWindow = absoluteCurrentTime + LOOK_AHEAD_SECONDS;
      const loopLength = loopEnd - loopStart;

      currentProject.tracks.forEach((track) => {
        const trackChain = trackNodesRef.current.get(track.id);
        if (!trackChain) return;

        track.clips.forEach((clip) => {
          if (track.type === "audio") {
            const scheduleAudioClipInstance = async (
              monotonicStartTime: number,
              iteration: number,
            ) => {
              if (!clip.audioData) return;

              const scheduleKey = `${track.id}:${clip.id}:audio:${revision}:${iteration}`;
              if (
                scheduledNotesRef.current.has(scheduleKey) ||
                pendingSchedulesRef.current.has(scheduleKey)
              )
                return;

              pendingSchedulesRef.current.add(scheduleKey);

              try {
                const audioBuffer = await getDecodedAudioBuffer(
                  context,
                  clip.audioData,
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

            const scheduleInstance = (
              monotonicStartTime: number,
              iteration: number,
            ) => {
              if (
                monotonicStartTime < absoluteCurrentTime ||
                monotonicStartTime > scheduleUntilWindow
              )
                return;

              const scheduleKey = `${track.id}:${clip.id}:${note.id}:${revision}:${iteration}`;
              if (scheduledNotesRef.current.has(scheduleKey)) return;

              const startAt =
                lastSyncTimeRef.current.audioTime +
                (monotonicStartTime - lastSyncTimeRef.current.sequenceTime);
              const stopAt = Math.max(
                startAt + MIN_NOTE_DURATION_SECONDS,
                startAt + note.duration,
              );
              const osc = context.createOscillator();
              const noteGain = context.createGain();

              osc.type = "triangle";
              osc.frequency.value = midiNoteToFrequency(note.pitch);

              const velocity = note.velocity / 127;
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

    worker.addEventListener("message", onMessage);
    handleTick();

    return () => {
      worker.removeEventListener("message", onMessage);
    };
  }, [isPlaying, currentProject, revision, isLooping, loopStart, loopEnd]);

  // シーク時（revision変更時）のクリーンアップ
  useEffect(() => {
    if (isPlaying) {
      playbackSessionRef.current += 1;
      activeNodesRef.current.forEach((node) => {
        try {
          node.stop();
        } catch (e) {}
      });
      activeNodesRef.current.clear();
      scheduledNotesRef.current.clear();
      pendingSchedulesRef.current.clear();
    }
  }, [revision]);

  return { audioContext: audioContextRef.current };
};
