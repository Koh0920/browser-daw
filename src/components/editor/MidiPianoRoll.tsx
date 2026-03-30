import { useEffect, useMemo, useRef, useState } from "react"
import type { MidiClip, MidiNote, ProjectTrack } from "@/types"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport } from "@/hooks/useTransport"

const ROW_HEIGHT = 20
const PIANO_WIDTH = 72
const PIXELS_PER_SECOND = 96
const RULER_HEIGHT = 28
const LOWEST_PITCH = 24  // C0
const HIGHEST_PITCH = 108 // C7
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

interface MidiPianoRollProps {
  track: ProjectTrack | null
  clip: MidiClip | null
  duration: number
  bpm: number
}

const snapToGrid = (time: number, bpm: number) => {
  const beatDuration = 60 / Math.max(bpm, 1)
  const grid = beatDuration / 4 // 16th notes
  return Math.max(0, Math.round(time / grid) * grid)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const MidiPianoRoll = ({ track, clip, duration, bpm }: MidiPianoRollProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ noteId: string; offsetX: number; offsetY: number; isResizing: boolean } | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const replaceClipNotes = useProjectStore((state) => state.replaceClipNotes)
  const { currentTime, seek } = useTransport()

  const pitches = useMemo(() => {
    return Array.from({ length: HIGHEST_PITCH - LOWEST_PITCH + 1 }, (_, index) => HIGHEST_PITCH - index)
  }, [])

  const canvasWidth = Math.max(800, duration * PIXELS_PER_SECOND)
  const canvasHeight = pitches.length * ROW_HEIGHT

  // Calculate beat/bar spacing
  const beatDuration = 60 / Math.max(bpm, 1) // seconds per beat
  const beatWidth = beatDuration * PIXELS_PER_SECOND
  const barWidth = beatWidth * 4

  useEffect(() => {
    setSelectedNoteId(null)
  }, [clip?.id])

  useEffect(() => {
    // Initial scroll setup: scroll to C3 (pitch 60)
    if (containerRef.current) {
      const c3Index = pitches.findIndex(p => p === 60)
      if (c3Index !== -1) {
        containerRef.current.scrollTop = Math.max(0, (c3Index * ROW_HEIGHT) - 150)
      }
    }
  }, [pitches])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return
      }

      if (!clip || !track || !selectedNoteId) {
        return
      }
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return
      }

      event.preventDefault()
      replaceClipNotes(track.id, clip.id, clip.notes.filter((note) => note.id !== selectedNoteId))
      setSelectedNoteId(null)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [clip, replaceClipNotes, selectedNoteId, track])

  const handleGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!track || !clip || !containerRef.current) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top

    if (localX < 0) {
      return
    }

    const pitchIndex = clamp(Math.floor(localY / ROW_HEIGHT), 0, pitches.length - 1)
    const pitch = pitches[pitchIndex]
    
    const note: MidiNote = {
      id: crypto.randomUUID(),
      pitch,
      startTime: snapToGrid(localX / PIXELS_PER_SECOND, bpm),
      duration: beatDuration, // 1 beat default
      velocity: 96,
    }

    replaceClipNotes(track.id, clip.id, [...clip.notes, note].sort((left, right) => left.startTime - right.startTime))
    setSelectedNoteId(note.id)
  }

  const handleNoteMouseDown = (event: React.MouseEvent<HTMLDivElement>, noteId: string, isResizing: boolean = false) => {
    event.stopPropagation()
    const noteRect = event.currentTarget.getBoundingClientRect()
    
    // Check if clicked near the right edge for resizing
    const clickX = event.clientX - noteRect.left
    const resizing = clickX > noteRect.width - 8

    dragStateRef.current = {
      noteId,
      offsetX: clickX,
      offsetY: event.clientY - noteRect.top,
      isResizing: resizing || isResizing
    }
    setSelectedNoteId(noteId)
  }

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || !track || !clip || !containerRef.current) {
      return
    }

    const gridRect = containerRef.current.querySelector('.grid-area')?.getBoundingClientRect()
    if (!gridRect) return

    const { noteId, offsetX, isResizing } = dragStateRef.current
    const localX = event.clientX - gridRect.left
    const localY = event.clientY - gridRect.top

    const targetNote = clip.notes.find(n => n.id === noteId)
    if (!targetNote) return

    if (isResizing) {
      // Resize horizontally only
      const rawDuration = (localX - (targetNote.startTime * PIXELS_PER_SECOND)) / PIXELS_PER_SECOND
      const snappedDuration = Math.max(beatDuration / 4, Math.round(rawDuration / (beatDuration / 4)) * (beatDuration / 4))
      
      replaceClipNotes(
        track.id,
        clip.id,
        clip.notes.map((note) => note.id === noteId ? { ...note, duration: snappedDuration } : note)
      )
    } else {
      // Move both vertically and horizontally
      const nextPitch = pitches[clamp(Math.floor(localY / ROW_HEIGHT), 0, pitches.length - 1)]
      const nextStartTime = Math.max(0, snapToGrid((localX - offsetX) / PIXELS_PER_SECOND, bpm))

      replaceClipNotes(
        track.id,
        clip.id,
        clip.notes.map((note) => note.id === noteId ? { ...note, pitch: nextPitch, startTime: nextStartTime } : note)
      )
    }
  }

  const handlePointerUp = () => {
    dragStateRef.current = null
  }
  
  // Render timeline ruler marks
  const renderRulerMarks = () => {
    const marks = []
    const totalBeats = Math.ceil((canvasWidth / PIXELS_PER_SECOND) / beatDuration)
    
    for (let i = 0; i <= totalBeats; i++) {
        const xPos = i * beatWidth
        const isBar = i % 4 === 0
        
        marks.push(
            <div key={`ruler-${i}`} className="absolute top-0 bottom-0 border-l border-slate-700/80" style={{ left: `${xPos}px`, height: isBar ? '100%' : '30%', top: isBar ? '0' : 'auto', bottom: '0' }}>
                {isBar && (
                    <span className="absolute left-1.5 top-1 text-[10px] font-semibold text-slate-400 select-none">
                        {(i / 4) + 1}
                    </span>
                )}
            </div>
        )
    }
    return marks
  }

  return (
    <div className="flex h-full flex-col bg-[#1A1D24]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-900 bg-[#252A36] px-4 py-2 shadow-sm z-30 relative">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Piano Roll</h2>
          <div className="h-4 w-px bg-slate-700"></div>
          <p className="text-xs font-semibold text-slate-200">{track?.name || "No track selected"}</p>
        </div>
        {clip && <span className="text-[10px] font-medium text-slate-500 bg-slate-800/50 px-2 py-1 rounded">Click to add. Drag to move/resize.</span>}
      </div>

      {!track || !clip ? (
        <div className="flex flex-1 items-center justify-center p-8 bg-[#1A1D24]">
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/30 px-8 py-12 text-center text-sm font-medium text-slate-400 shadow-inner">
             Import MIDI or add a track to open the piano roll.
          </div>
        </div>
      ) : (
        <div 
          ref={containerRef}
          className="relative flex-1 overflow-auto bg-[#1A1D24] scroll-smooth"
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        >
          {/* Virtual Canvas */}
          <div style={{ width: `${PIANO_WIDTH + canvasWidth}px`, height: `${canvasHeight + RULER_HEIGHT}px` }} className="relative">
            
            {/* Top-Left Corner (Sticky) */}
            <div className="sticky left-0 top-0 z-40 h-[28px] w-[72px] border-b border-r border-[#0F131A] bg-[#2A303C] shadow-sm backdrop-blur-md" />

            {/* Timeline Ruler (Sticky Top) */}
            <div 
                className="sticky top-0 z-30 h-[28px] border-b border-[#0F131A] bg-[#2A303C]/95 backdrop-blur-md overflow-hidden cursor-pointer" 
                style={{ left: PIANO_WIDTH, width: canvasWidth }}
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    seek(Math.max(0, x / PIXELS_PER_SECOND))
                }}
            >
                {/* Ruler Marks */}
                <div className="relative h-full w-full">
                    {renderRulerMarks()}
                    
                    {/* Playhead arrow in ruler */}
                    <div className="absolute top-0 bottom-0 w-[9px] -ml-[4px] z-20 pointer-events-none" style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}>
                        <div className="absolute top-[16px] left-0 right-0 h-[12px]">
                            <svg viewBox="0 0 9 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M0 0H9V6L4.5 12L0 6V0Z" fill="#F87171"/>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Left Keyboard (Sticky Left) */}
            <div 
                className="sticky left-0 z-20 w-[72px] border-r border-[#0F131A] bg-slate-200 shadow-[3px_0_15px_rgba(0,0,0,0.5)]" 
                style={{ top: RULER_HEIGHT, height: canvasHeight }}
            >
                <div className="relative h-full w-full">
                    {pitches.map((pitch, i) => {
                        const isBlackKey = NOTE_NAMES[pitch % 12].includes("#")
                        const isC = NOTE_NAMES[pitch % 12] === "C"
                        const top = i * ROW_HEIGHT

                        if (isBlackKey) {
                            return (
                                <button
                                    key={pitch}
                                    type="button"
                                    className="absolute left-0 z-10 w-[44px] rounded-r-[3px] border-y border-r border-[#0F131A] bg-gradient-to-r from-slate-900 to-slate-800 shadow-[0_3px_5px_rgba(0,0,0,0.6)] hover:brightness-125 focus:brightness-125 transition-all text-[9px] font-bold text-slate-500 text-right pr-2"
                                    style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
                                    onClick={() => seek(currentTime)}
                                >
                                    {NOTE_NAMES[pitch % 12]}
                                </button>
                            )
                        } else {
                            return (
                                <button
                                    key={pitch}
                                    type="button"
                                    className={`absolute left-0 w-full border-b flex items-center justify-end pr-2 text-[10px] font-bold transition-all hover:brightness-95 focus:brightness-95 shadow-inner ${isC ? "border-[#A0AABF] bg-slate-100 text-slate-600" : "border-[#CBD5E1] bg-slate-200 text-slate-500"}`}
                                    style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
                                    onClick={() => seek(currentTime)}
                                >
                                    {NOTE_NAMES[pitch % 12]}{Math.floor(pitch / 12) - 1}
                                </button>
                            )
                        }
                    })}
                </div>
            </div>

            {/* Grid Area */}
            <div 
                className="grid-area absolute z-10 overflow-hidden bg-[#1A1D24]" 
                style={{ left: PIANO_WIDTH, top: RULER_HEIGHT, width: canvasWidth, height: canvasHeight }}
                onClick={handleGridClick}
            >
                {/* Horizontal Pitch Backgrounds */}
                {pitches.map((pitch, i) => {
                    const isBlackKey = NOTE_NAMES[pitch % 12].includes("#")
                    const isC = NOTE_NAMES[pitch % 12] === "C"
                    return (
                        <div 
                            key={`bg-${pitch}`} 
                            className={`absolute w-full border-b ${isBlackKey ? 'bg-[#14171D] border-transparent' : 'bg-[#1A1D24] border-[#222731]'}`} 
                            style={{ 
                                top: i * ROW_HEIGHT, 
                                height: ROW_HEIGHT,
                                ...(isC && { borderBottomColor: '#2C3340', borderBottomWidth: '2px' }) 
                            }} 
                        />
                    )
                })}

                {/* Vertical Beat Lines (Using repeating linear gradient for performance) */}
                <div 
                    className="absolute inset-0 pointer-events-none opacity-40 mix-blend-screen"
                    style={{
                        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                        backgroundSize: `${barWidth}px 100%, ${beatWidth}px 100%`,
                    }} 
                />

                {/* Drawn Notes */}
                {clip.notes.map((note) => {
                  const pitchIndex = pitches.findIndex((pitch) => pitch === note.pitch)
                  if (pitchIndex === -1) {
                    return null
                  }

                  const isSelected = selectedNoteId === note.id

                  return (
                    <div
                      key={note.id}
                      className={`absolute rounded-[3px] border text-left text-[9px] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-all cursor-move select-none ${
                          isSelected 
                           ? "z-10 border-cyan-200 bg-gradient-to-b from-cyan-400 to-cyan-500 text-white shadow-[0_0_12px_rgba(34,211,238,0.5)] scale-[1.02]" 
                           : "border-cyan-500/60 bg-gradient-to-b from-[#22d3ee] to-[#0891b2] text-cyan-50 hover:brightness-110 active:scale-[0.98]"
                      }`}
                      style={{
                        left: `${note.startTime * PIXELS_PER_SECOND}px`,
                        top: `${pitchIndex * ROW_HEIGHT + 1}px`,
                        width: `${Math.max(12, note.duration * PIXELS_PER_SECOND)}px`,
                        height: `${ROW_HEIGHT - 2}px`,
                      }}
                      onMouseDown={(event) => handleNoteMouseDown(event, note.id)}
                    >
                      {/* Left highlight strip indicating velocity/attack */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[2px] bg-white/40 pointer-events-none" />
                      
                      {/* Note Label */}
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 truncate pr-2 pointer-events-none mix-blend-overlay opacity-90 drop-shadow-sm">
                          {NOTE_NAMES[note.pitch % 12]}
                      </span>

                      {/* Right edge resize handle overlay */}
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 transition-colors rounded-r-[2px]"
                        onMouseDown={(e) => handleNoteMouseDown(e, note.id, true)}
                      />
                    </div>
                  )
                })}

                {/* Playhead Vertical Line */}
                <div 
                    className="absolute top-0 bottom-0 z-20 w-[1px] bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)] pointer-events-none" 
                    style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }} 
                />

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MidiPianoRoll