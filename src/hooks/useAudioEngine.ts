import { useEffect, useMemo, useRef } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport } from "./useTransport"

const LOOK_AHEAD_SECONDS = 0.2
// WorkerのTick間隔より少し長めにとることで、余裕を持ってスケジュールします

const midiNoteToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12)

export const useAudioEngine = () => {
  const currentProject = useProjectStore((state) => state.currentProject)
  // ★ isLooping, loopStart, loopEnd を追加で取得します
  const { currentTime, isPlaying, revision, isLooping, loopStart, loopEnd } = useTransport()
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const trackNodesRef = useRef<Map<string, GainNode>>(new Map())
  const scheduledNotesRef = useRef<Set<string>>(new Set())
  const activeNodesRef = useRef<Set<AudioScheduledSourceNode>>(new Set())
  const workerRef = useRef<Worker | null>(null)

  // ★ 追加: 再生・シークした瞬間の「Audioの時計」と「シーケンスの時計」を記録するRef
  const lastSyncTimeRef = useRef({ audioTime: 0, sequenceTime: 0 })

  const trackMixerState = useMemo(() => {
    if (!currentProject) return new Map()
    const hasSolo = currentProject.tracks.some(t => t.solo)
    return new Map(currentProject.tracks.map(track => {
      let effectiveVolume = track.volume
      if (track.muted) effectiveVolume = 0
      else if (hasSolo && !track.solo) effectiveVolume = 0
      return [track.id, effectiveVolume]
    }))
  }, [currentProject])

  // AudioContext と Worker の初期化
  useEffect(() => {
    const context = new AudioContext()
    const masterGain = context.createGain()
    masterGain.gain.value = 0.7
    masterGain.connect(context.destination)
    
    audioContextRef.current = context
    masterGainRef.current = masterGain

    const worker = new Worker(new URL("../audio/audioWorker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker

    const unlockAudioContext = () => {
      if (context.state === 'suspended') {
        void context.resume()
      }
    }
    document.addEventListener('click', unlockAudioContext, { once: true })

    return () => {
      document.removeEventListener('click', unlockAudioContext)
      worker.terminate()
      
      activeNodesRef.current.forEach(node => {
        try { node.stop() } catch (e) {}
      })
      activeNodesRef.current.clear()
      
      trackNodesRef.current.forEach(node => node.disconnect())
      trackNodesRef.current.clear()
      scheduledNotesRef.current.clear()
      
      void context.close()
    }
  }, [])

  // Track Nodes (GainNodes) の同期
  useEffect(() => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    if (!context || !masterGain || !currentProject) return

    currentProject.tracks.forEach(track => {
      if (!trackNodesRef.current.has(track.id)) {
        const gain = context.createGain()
        gain.connect(masterGain)
        trackNodesRef.current.set(track.id, gain)
      }
      
      const gainNode = trackNodesRef.current.get(track.id)!
      const targetVolume = trackMixerState.get(track.id) ?? 0
      
      gainNode.gain.setValueAtTime(gainNode.gain.value, context.currentTime)
      gainNode.gain.setTargetAtTime(targetVolume * 0.2, context.currentTime, 0.02)
    })

    const trackIds = new Set(currentProject.tracks.map(t => t.id))
    trackNodesRef.current.forEach((node, id) => {
      if (!trackIds.has(id)) {
        node.disconnect()
        trackNodesRef.current.delete(id)
      }
    })
  }, [currentProject, trackMixerState])

  // ★ 追加: シークや再生開始時に、マスタークロックの基準位置を記録
  useEffect(() => {
    if (audioContextRef.current) {
      lastSyncTimeRef.current = {
        audioTime: audioContextRef.current.currentTime,
        sequenceTime: currentTime
      }
    }
  }, [isPlaying, revision])

  // Playback State & Scheduling
  useEffect(() => {
    const worker = workerRef.current
    const context = audioContextRef.current
    if (!worker || !context) return

    if (!isPlaying) {
      worker.postMessage({ command: "stop" })
      activeNodesRef.current.forEach(node => {
        try { node.stop() } catch (e) {}
      })
      activeNodesRef.current.clear()
      scheduledNotesRef.current.clear()
      return
    }

    if (context.state === 'suspended') {
      void context.resume()
    }
    
    worker.postMessage({ command: "start" })

    const handleTick = () => {
      if (!currentProject || !isPlaying) return

      const now = context.currentTime
      
      // 現在のAudio経過時間から、モノトニック（単調増加）なシーケンス時間を計算
      const elapsedAudioTime = now - lastSyncTimeRef.current.audioTime
      const absoluteCurrentTime = lastSyncTimeRef.current.sequenceTime + elapsedAudioTime
      const scheduleUntilWindow = absoluteCurrentTime + LOOK_AHEAD_SECONDS
      const loopLength = loopEnd - loopStart

      currentProject.tracks.forEach(track => {
        const trackGain = trackNodesRef.current.get(track.id)
        if (!trackGain) return

        track.clips.forEach(clip => {
          clip.notes.forEach(note => {
            const absoluteStartTime = clip.startTime + note.startTime

            // ノート発音のコアロジックを関数化
            const scheduleInstance = (monotonicStartTime: number, iteration: number) => {
              if (monotonicStartTime < absoluteCurrentTime || monotonicStartTime > scheduleUntilWindow) return

              const scheduleKey = `${track.id}:${clip.id}:${note.id}:${revision}:${iteration}`
              if (scheduledNotesRef.current.has(scheduleKey)) return

              const startAt = lastSyncTimeRef.current.audioTime + (monotonicStartTime - lastSyncTimeRef.current.sequenceTime)
              const stopAt = Math.max(startAt + 0.05, startAt + note.duration)

              // --- 発音処理 ---
              const osc = context.createOscillator()
              const noteGain = context.createGain()
              
              osc.type = "triangle"
              osc.frequency.value = midiNoteToFrequency(note.pitch)
              
              const velocity = note.velocity / 127
              noteGain.gain.setValueAtTime(0, startAt)
              noteGain.gain.linearRampToValueAtTime(velocity, startAt + 0.01)
              noteGain.gain.setValueAtTime(velocity, Math.max(startAt + 0.01, stopAt - 0.05))
              noteGain.gain.exponentialRampToValueAtTime(0.001, stopAt)

              osc.connect(noteGain)
              noteGain.connect(trackGain)

              osc.start(startAt)
              osc.stop(stopAt)

              activeNodesRef.current.add(osc)
              scheduledNotesRef.current.add(scheduleKey)

              osc.onended = () => {
                activeNodesRef.current.delete(osc)
                noteGain.disconnect()
              }
            }

            // ループ有効時のスケジュール展開
            if (!isLooping || loopLength <= 0) {
              scheduleInstance(absoluteStartTime, 0)
            } else {
              if (absoluteStartTime < loopStart) {
                // ループ前のノートは最初の1回だけ鳴る
                scheduleInstance(absoluteStartTime, 0)
              } else if (absoluteStartTime >= loopStart && absoluteStartTime < loopEnd) {
                // 先読み期間に入るすべての周回（イテレーション）を探す
                const minIter = Math.max(0, Math.floor((absoluteCurrentTime - absoluteStartTime) / loopLength))
                const maxIter = Math.max(0, Math.ceil((scheduleUntilWindow - absoluteStartTime) / loopLength))

                for (let i = minIter; i <= maxIter; i++) {
                  scheduleInstance(absoluteStartTime + i * loopLength, i)
                }
              }
              // absoluteStartTime >= loopEnd のノートはループ中には鳴らない
            }
          })
        })
      })
    }

    const onMessage = (e: MessageEvent) => {
      if (e.data.type === "tick") handleTick()
    }

    worker.addEventListener("message", onMessage)
    handleTick()

    return () => {
      worker.removeEventListener("message", onMessage)
    }
  }, [isPlaying, currentProject, revision, isLooping, loopStart, loopEnd])

  // シーク時（revision変更時）のクリーンアップ
  useEffect(() => {
    if (isPlaying) {
      activeNodesRef.current.forEach(node => {
        try { node.stop() } catch (e) {}
      })
      activeNodesRef.current.clear()
      scheduledNotesRef.current.clear()
    }
  }, [revision])

  return { audioContext: audioContextRef.current }
}
