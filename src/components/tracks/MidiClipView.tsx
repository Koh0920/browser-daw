"use client"

import { useRef, useEffect } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransportCurrentTime } from "@/hooks/useTransport"
import type { MidiTrack, MidiNote } from "@/types"

interface MidiClipViewProps {
  track: MidiTrack
  readOnly?: boolean
}

const MidiClipView = ({ track, readOnly = false }: MidiClipViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentProject } = useProjectStore()
  const currentTime = useTransportCurrentTime()
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

    // Horizontal grid lines (12 notes)
    const noteHeight = canvasHeight / 12
    for (let i = 0; i <= 12; i++) {
      const y = i * noteHeight
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasWidth, y)
      ctx.stroke()
    }

    // Draw MIDI notes
    if (track.clips && track.clips.length > 0) {
      track.clips.forEach((clip) => {
        if (clip.notes && clip.notes.length > 0) {
          clip.notes.forEach((note) => {
            drawNote(ctx, note, clip.startTime)
          })
        }
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

  const drawNote = (ctx: CanvasRenderingContext2D, note: MidiNote, clipStartTime: number) => {
    const x = (clipStartTime + note.startTime) * zoom
    const width = note.duration * zoom
    const noteHeight = canvasHeight / 12
    const y = canvasHeight - ((note.pitch % 12) + 1) * noteHeight

    ctx.fillStyle = "rgba(0, 120, 255, 0.7)"
    ctx.fillRect(x, y, width, noteHeight)

    ctx.strokeStyle = "rgba(0, 80, 255, 1)"
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, width, noteHeight)
  }

  return (
    <div className="relative border border-border rounded-md overflow-hidden">
      <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="block" />
    </div>
  )
}

export default MidiClipView
