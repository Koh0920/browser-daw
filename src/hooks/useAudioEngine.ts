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
      
      // ★ 修正: UIの時計を使わず、AudioContextの経過時間から「超正確な現在位置」を計算
      const elapsedAudioTime = now - lastSyncTimeRef.current.audioTime
      let preciseCurrentPos = lastSyncTimeRef.current.sequenceTime + elapsedAudioTime

      // ループ対応：正確な時間がループ終端を超えていたら、ループ周回数とオフセットを計算
      let loopIteration = 0
      let loopOffset = 0
      if (isLooping && loopEnd > loopStart && preciseCurrentPos >= loopEnd) {
        loopIteration = Math.floor((preciseCurrentPos - loopStart) / (loopEnd - loopStart))
        loopOffset = loopIteration * (loopEnd - loopStart)
        // 判定用の現在位置をループ範囲内に巻き戻す
        preciseCurrentPos -= loopOffset
      }

      const scheduleUntil = preciseCurrentPos + LOOK_AHEAD_SECONDS

      currentProject.tracks.forEach(track => {
        const trackGain = trackNodesRef.current.get(track.id)
        if (!trackGain) return

        track.clips.forEach(clip => {
          clip.notes.forEach(note => {
            const absoluteStartTime = clip.startTime + note.startTime

            // ノートがループ範囲内にある場合、現在の周回に合わせた時間に補正
            let adjustedStartTime = absoluteStartTime
            if (isLooping && absoluteStartTime >= loopStart && absoluteStartTime < loopEnd) {
              adjustedStartTime += loopOffset
            }

            // 重複発音を防ぐキーに、ループ周回数(loopIteration)を含める
            const scheduleKey = `${track.id}:${clip.id}:${note.id}:${revision}:${loopIteration}`

            if (
              adjustedStartTime < preciseCurrentPos || 
              adjustedStartTime > scheduleUntil || 
              scheduledNotesRef.current.has(scheduleKey)
            ) {
              return
            }

            // ★ 究極の修正: スケジュール時刻を AudioContext 基準で計算（絶対に揺らがない）
            const startAt = lastSyncTimeRef.current.audioTime + (adjustedStartTime - lastSyncTimeRef.current.sequenceTime)
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
