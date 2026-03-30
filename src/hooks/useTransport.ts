import { useEffect, useRef } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransportStore } from "@/stores/transportStore"

export const useTransport = () => {
  const currentProject = useProjectStore((state) => state.currentProject)
  const store = useTransportStore()
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!store.isPlaying) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastTimeRef.current = null
      return
    }

    const loop = (frameTime: number) => {
      const previousFrameTime = lastTimeRef.current ?? frameTime
      const deltaSeconds = (frameTime - previousFrameTime) / 1000
      lastTimeRef.current = frameTime

      const projectDuration = currentProject?.duration ?? Infinity
      let nextTime = store.currentTime + deltaSeconds

      if (store.isLoopEnabled && nextTime >= store.loopEnd) {
        nextTime = store.loopStart + (nextTime - store.loopEnd)
      }

      if (nextTime >= projectDuration) {
        store.stop()
        return
      }

      store.setCurrentTime(nextTime)
      animationFrameRef.current = requestAnimationFrame(loop)
    }

    animationFrameRef.current = requestAnimationFrame(loop)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [currentProject?.duration, store])

  return {
    ...store,
    isLooping: store.isLoopEnabled,
    togglePlay: store.togglePlayback,
    seekTo: store.seek,
    setLooping: store.setLoopEnabled,
  }
}
