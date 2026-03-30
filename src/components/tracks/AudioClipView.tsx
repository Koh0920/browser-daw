"use client"

import { useRef, useEffect } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport } from "@/hooks/useTransport"
import type { AudioTrack, AudioClip } from "@/types"

interface AudioClipViewProps {
  track: AudioTrack
  readOnly?: boolean
}

const AudioClipView = ({ track, readOnly = false }: AudioClipViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentProject } = useProjectStore()
  const { currentTime } = useTransport()
  const zoom = 100 // pixels per second

  const duration = currentProject?.duration || 60
  const canvasWidth = duration * zoom
  const canvasHeight = 100

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
    ctx.lineWidth = 1

    // Vertical grid lines (1 second intervals)
    for (let i = 0; i <= duration; i++) {
      const x = i * zoom
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    // Draw audio clips
    if (track.clips && track.clips.length > 0) {
      track.clips.forEach((clip) => {
        drawAudioClip(ctx, clip)
      })
    }

    // Draw playhead
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"
    ctx.lineWidth = 2
    const playheadX = currentTime * zoom
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, canvasHeight)
    ctx.stroke()
  }, [track, currentTime, duration, zoom])

  const drawAudioClip = (ctx: CanvasRenderingContext2D, clip: AudioClip) => {
    const x = clip.startTime * zoom
    const width = clip.duration * zoom

    // Draw clip background
    ctx.fillStyle = "rgba(255, 80, 80, 0.3)"
    ctx.fillRect(x, 0, width, canvasHeight)

    // Draw clip border
    ctx.strokeStyle = "rgba(255, 80, 80, 0.8)"
    ctx.lineWidth = 1
    ctx.strokeRect(x, 0, width, canvasHeight)

    // Draw clip name
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)"
    ctx.font = "10px sans-serif"
    ctx.fillText(clip.name, x + 5, 15)

    // Draw waveform if we have audio data
    if (clip.waveformData) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
      ctx.lineWidth = 1
      ctx.beginPath()

      const middle = canvasHeight / 2
      const waveformLength = clip.waveformData.length
      const step = Math.max(1, Math.floor(waveformLength / width))

      for (let i = 0; i < waveformLength; i += step) {
        const x1 = x + (i / waveformLength) * width
        const y1 = middle + (clip.waveformData[i] * canvasHeight) / 2

        if (i === 0) {
          ctx.moveTo(x1, y1)
        } else {
          ctx.lineTo(x1, y1)
        }
      }

      ctx.stroke()
    }
  }

  return (
    <div className="relative border border-border rounded-md overflow-hidden">
      <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="block" />
    </div>
  )
}

export default AudioClipView
