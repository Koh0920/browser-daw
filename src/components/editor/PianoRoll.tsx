import type React from "react"

import { useRef, useEffect, useState } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport, useTransportCurrentTime } from "@/hooks/useTransport"
import type { MidiTrack, MidiNote, MidiClip } from "@/types"

interface PianoRollProps {
  track: MidiTrack
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const OCTAVES = [1, 2, 3, 4, 5, 6]
const NOTE_HEIGHT = 20
const PIANO_WIDTH = 80

const PianoRoll = ({ track }: PianoRollProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pianoRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { currentProject, replaceClipNotes } = useProjectStore()
  const currentTime = useTransportCurrentTime()
  const { isPlaying } = useTransport()

  const [zoom, setZoom] = useState(100) // pixels per second
  const [selectedClip, setSelectedClip] = useState<MidiClip | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragNote, setDragNote] = useState<{ note: MidiNote; action: "move" | "resize" } | null>(null)

  const duration = currentProject?.duration || 60
  const canvasWidth = duration * zoom
  const canvasHeight = NOTES.length * OCTAVES.length * NOTE_HEIGHT

  // Initialize or find a clip to edit
  useEffect(() => {
    if (track.clips && track.clips.length > 0) {
      setSelectedClip(track.clips[0])
    } else {
      setSelectedClip(null)
    }
  }, [track.clips])

  // Draw piano roll
  useEffect(() => {
    const canvas = canvasRef.current
    const piano = pianoRef.current
    if (!canvas || !piano || !selectedClip) return

    const ctx = canvas.getContext("2d")
    const pianoCtx = piano.getContext("2d")
    if (!ctx || !pianoCtx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    pianoCtx.clearRect(0, 0, piano.width, piano.height)

    // Draw piano keys
    for (let octave = OCTAVES.length - 1; octave >= 0; octave--) {
      for (let note = 0; note < NOTES.length; note++) {
        const y = (OCTAVES.length - 1 - octave) * NOTES.length * NOTE_HEIGHT + note * NOTE_HEIGHT
        const isBlackKey = NOTES[note].includes("#")

        pianoCtx.fillStyle = isBlackKey ? "#333" : "#fff"
        pianoCtx.fillRect(0, y, PIANO_WIDTH, NOTE_HEIGHT)

        pianoCtx.strokeStyle = "#999"
        pianoCtx.strokeRect(0, y, PIANO_WIDTH, NOTE_HEIGHT)

        pianoCtx.fillStyle = isBlackKey ? "#fff" : "#000"
        pianoCtx.font = "10px sans-serif"
        pianoCtx.fillText(`${NOTES[note]}${octave + 1}`, 5, y + NOTE_HEIGHT - 5)
      }
    }

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
    ctx.lineWidth = 1

    // Vertical grid lines (beats)
    const beatsPerSecond = currentProject?.bpm ? currentProject.bpm / 60 : 2
    const pixelsPerBeat = zoom / beatsPerSecond

    for (let i = 0; i <= duration * beatsPerSecond; i++) {
      const x = i * pixelsPerBeat
      const isMeasureStart = i % 4 === 0

      ctx.strokeStyle = isMeasureStart ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.1)"
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    // Horizontal grid lines (notes)
    for (let i = 0; i <= NOTES.length * OCTAVES.length; i++) {
      const y = i * NOTE_HEIGHT
      const isOctaveStart = i % NOTES.length === 0

      ctx.strokeStyle = isOctaveStart ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.1)"
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasWidth, y)
      ctx.stroke()
    }

    // Draw notes
    if (selectedClip.notes && selectedClip.notes.length > 0) {
      selectedClip.notes.forEach((note) => {
        drawNote(ctx, note)
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
  }, [selectedClip, currentTime, duration, zoom, currentProject?.bpm])

  // Auto-scroll: requestAnimationFrame でプレイヘッドを追いかける
  const animFrameRef = useRef<number | null>(null)
  const isPlayingRef = useRef(isPlaying)
  const currentTimeScrollRef = useRef(currentTime)

  useEffect(() => {
    isPlayingRef.current = isPlaying
    currentTimeScrollRef.current = currentTime
  })

  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      return
    }

    const scrollLoop = () => {
      const container = containerRef.current
      if (container && isPlayingRef.current) {
        const playheadX = currentTimeScrollRef.current * zoom
        // コンテナの可視幅（ピアノ鍵盤を除いた実際のグリッド幅）
        const visibleWidth = container.clientWidth - PIANO_WIDTH
        // スクロール量 = プレイヘッドX からコンテナのスクロール位置を引いたもの
        const targetScrollLeft = playheadX - visibleWidth * 0.35
        container.scrollLeft = Math.max(0, targetScrollLeft)
      }
      animFrameRef.current = requestAnimationFrame(scrollLoop)
    }

    animFrameRef.current = requestAnimationFrame(scrollLoop)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
  }, [isPlaying, zoom])

  const drawNote = (ctx: CanvasRenderingContext2D, note: MidiNote) => {
    const x = note.startTime * zoom
    const width = note.duration * zoom

    // Calculate y position based on pitch
    const octave = Math.floor(note.pitch / 12)
    const noteIndex = note.pitch % 12
    const y = (OCTAVES.length - 1 - (octave - 1)) * NOTES.length * NOTE_HEIGHT + noteIndex * NOTE_HEIGHT

    ctx.fillStyle = "rgba(0, 120, 255, 0.7)"
    ctx.fillRect(x, y, width, NOTE_HEIGHT)

    ctx.strokeStyle = "rgba(0, 80, 255, 1)"
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, width, NOTE_HEIGHT)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedClip || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setDragStart({ x, y })

    // Check if clicking on an existing note
    const clickTimePosition = x / zoom
    const clickNotePosition = Math.floor(y / NOTE_HEIGHT)

    const clickedNote = selectedClip.notes.find((note) => {
      const noteStart = note.startTime
      const noteEnd = note.startTime + note.duration
      const octave = Math.floor(note.pitch / 12)
      const noteIndex = note.pitch % 12
      const noteY = (OCTAVES.length - 1 - (octave - 1)) * NOTES.length * NOTE_HEIGHT + noteIndex * NOTE_HEIGHT

      // Check if click is within note boundaries
      return clickTimePosition >= noteStart && clickTimePosition <= noteEnd && y >= noteY && y < noteY + NOTE_HEIGHT
    })

    if (clickedNote) {
      // Check if clicking near the edge (for resizing)
      const noteEndX = (clickedNote.startTime + clickedNote.duration) * zoom
      const isNearEdge = Math.abs(x - noteEndX) < 10

      setDragNote({
        note: clickedNote,
        action: isNearEdge ? "resize" : "move",
      })
    } else {
      // Add a new note
      const newNote: MidiNote = {
        id: `note-${Date.now()}`,
        pitch: calculatePitchFromY(y),
        startTime: clickTimePosition,
        duration: 0.25, // Default to 1/4 second
        velocity: 100,
      }

      const updatedNotes = [...selectedClip.notes, newNote]
      replaceClipNotes(track.id, selectedClip.id, updatedNotes)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart || !selectedClip || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (dragNote) {
      const dx = (x - dragStart.x) / zoom

      if (dragNote.action === "resize") {
        // Resize the note
        const newDuration = Math.max(0.1, dragNote.note.duration + dx)
        const updatedNotes = selectedClip.notes.map((note) =>
          note.id === dragNote.note.id ? { ...note, duration: newDuration } : note,
        )
        replaceClipNotes(track.id, selectedClip.id, updatedNotes)
      } else {
        // Move the note
        const dy = y - dragStart.y
        const pitchDelta = Math.round(dy / NOTE_HEIGHT)
        const newPitch = Math.max(0, Math.min(127, dragNote.note.pitch - pitchDelta))
        const newStartTime = Math.max(0, dragNote.note.startTime + dx)

        const updatedNotes = selectedClip.notes.map((note) =>
          note.id === dragNote.note.id ? { ...note, pitch: newPitch, startTime: newStartTime } : note,
        )
        replaceClipNotes(track.id, selectedClip.id, updatedNotes)
      }

      setDragStart({ x, y })
    }
  }

  const handleMouseUp = () => {
    setDragStart(null)
    setDragNote(null)
  }

  const calculatePitchFromY = (y: number) => {
    const noteIndex = Math.floor(y / NOTE_HEIGHT) % NOTES.length
    const octaveIndex = Math.floor(y / (NOTE_HEIGHT * NOTES.length))
    const octave = OCTAVES.length - 1 - octaveIndex
    return (octave + 1) * 12 + noteIndex
  }

  return (
    <div 
      className="relative h-full overflow-auto bg-background" 
      ref={containerRef}
    >
      <div className="flex" style={{ width: `${canvasWidth + PIANO_WIDTH}px`, height: `${canvasHeight}px` }}>
        {/* Sticky Piano Keys */}
        <div className="sticky left-0 z-20 border-r border-border bg-background h-full overflow-hidden">
          <canvas 
            ref={pianoRef} 
            width={PIANO_WIDTH} 
            height={canvasHeight} 
          />
        </div>

        {/* Note Grid */}
        <div className="relative flex-1">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="cursor-pointer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>
    </div>
  )
}

export default PianoRoll
