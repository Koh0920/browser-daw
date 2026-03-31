import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiClip, MidiNote, ProjectTrack } from "@/types";
import { useProjectStore } from "@/stores/projectStore";
import { useTransport } from "@/hooks/useTransport";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";

const ROW_HEIGHT = 20;
const PIANO_WIDTH = 72;
const PIXELS_PER_SECOND = 96;
const RULER_HEIGHT = 28;
const VELOCITY_HEIGHT = 96;
const AUTOSCROLL_INTERVAL_MS = 120;
const AUTOSCROLL_LEAD_RATIO = 0.14;
const AUTOSCROLL_TRAIL_RATIO = 0.08;
const AUTOSCROLL_TARGET_RATIO = 0.28;
const MIN_AUTOSCROLL_DELTA_PX = 72;
const LOWEST_PITCH = 24; // C0
const HIGHEST_PITCH = 108; // C7
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

interface MidiPianoRollProps {
  track: ProjectTrack | null;
  clip: MidiClip | null;
  duration: number;
  bpm: number;
}

const snapToGrid = (time: number, bpm: number) => {
  const beatDuration = 60 / Math.max(bpm, 1);
  const grid = beatDuration / 4; // 16th notes
  return Math.max(0, Math.round(time / grid) * grid);
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const MidiPianoRoll = ({ track, clip, duration, bpm }: MidiPianoRollProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    noteId: string;
    offsetX: number;
    offsetY: number;
    isResizing: boolean;
  } | null>(null);
  const velocityDragRef = useRef<{ noteId: string } | null>(null);
  const velocityLaneRef = useRef<HTMLDivElement | null>(null);
  const autoScrollTargetRef = useRef<number | null>(null);
  const lastAutoscrollAtRef = useRef(0);
  const rulerPlayheadRef = useRef<HTMLDivElement | null>(null);
  const gridPlayheadRef = useRef<HTMLDivElement | null>(null);
  const velocityPlayheadRef = useRef<HTMLDivElement | null>(null);
  const isPlayingRef = useRef(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const replaceClipNotes = useProjectStore((state) => state.replaceClipNotes);
  const { isPlaying, seek } = useTransport();

  const pitches = useMemo(() => {
    return Array.from(
      { length: HIGHEST_PITCH - LOWEST_PITCH + 1 },
      (_, index) => HIGHEST_PITCH - index,
    );
  }, []);

  const canvasWidth = Math.max(800, duration * PIXELS_PER_SECOND);
  const canvasHeight = pitches.length * ROW_HEIGHT;

  // Calculate beat/bar spacing
  const beatDuration = 60 / Math.max(bpm, 1); // seconds per beat
  const beatWidth = beatDuration * PIXELS_PER_SECOND;
  const barWidth = beatWidth * 4;

  const updateNoteVelocity = (noteId: string, clientY: number) => {
    if (!track || !clip || !velocityLaneRef.current) {
      return;
    }

    const rect = velocityLaneRef.current.getBoundingClientRect();
    const normalized = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    const nextVelocity = Math.round(20 + normalized * 107);

    replaceClipNotes(
      track.id,
      clip.id,
      clip.notes.map((note) =>
        note.id === noteId ? { ...note, velocity: nextVelocity } : note,
      ),
    );
  };

  useEffect(() => {
    setSelectedNoteId(null);
  }, [clip?.id]);

  useEffect(() => {
    // Initial scroll setup: scroll to C3 (pitch 60)
    if (containerRef.current) {
      const c3Index = pitches.findIndex((p) => p === 60);
      if (c3Index !== -1) {
        containerRef.current.scrollTop = Math.max(
          0,
          c3Index * ROW_HEIGHT - 150,
        );
      }
    }
  }, [pitches]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const scrollElement = containerRef.current;
    const updatePlayhead = (time: number) => {
      const playheadX = time * PIXELS_PER_SECOND;

      if (!scrollElement) {
        return;
      }

      if (!isPlayingRef.current) {
        autoScrollTargetRef.current = null;
        return;
      }

      const now = performance.now();
      if (now - lastAutoscrollAtRef.current < AUTOSCROLL_INTERVAL_MS) {
        return;
      }
      lastAutoscrollAtRef.current = now;

      const timelineViewportWidth = Math.max(
        0,
        scrollElement.clientWidth - PIANO_WIDTH,
      );
      if (timelineViewportWidth <= 0) {
        return;
      }

      const viewportStart = scrollElement.scrollLeft;
      const safeStart = viewportStart + timelineViewportWidth * AUTOSCROLL_TRAIL_RATIO;
      const safeEnd =
        viewportStart + timelineViewportWidth * (1 - AUTOSCROLL_LEAD_RATIO);

      if (playheadX < safeStart || playheadX > safeEnd) {
        const nextScrollLeft = Math.max(
          0,
          playheadX - timelineViewportWidth * AUTOSCROLL_TARGET_RATIO,
        );

        if (
          autoScrollTargetRef.current === null ||
          Math.abs(nextScrollLeft - autoScrollTargetRef.current) > MIN_AUTOSCROLL_DELTA_PX
        ) {
          autoScrollTargetRef.current = nextScrollLeft;
        }

        if (
          Math.abs(scrollElement.scrollLeft - autoScrollTargetRef.current) > MIN_AUTOSCROLL_DELTA_PX
        ) {
          scrollElement.scrollLeft = autoScrollTargetRef.current;
        }
      } else {
        autoScrollTargetRef.current = null;
      }
    };

    updatePlayhead(getTransportCurrentTime());
    return subscribeTransportCurrentTime(updatePlayhead);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (!clip || !track || !selectedNoteId) {
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }

      event.preventDefault();
      replaceClipNotes(
        track.id,
        clip.id,
        clip.notes.filter((note) => note.id !== selectedNoteId),
      );
      setSelectedNoteId(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clip, replaceClipNotes, selectedNoteId, track]);

  const handleGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!track || !clip || !containerRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (localX < 0) {
      return;
    }

    const pitchIndex = clamp(
      Math.floor(localY / ROW_HEIGHT),
      0,
      pitches.length - 1,
    );
    const pitch = pitches[pitchIndex];

    const note: MidiNote = {
      id: crypto.randomUUID(),
      pitch,
      startTime: snapToGrid(localX / PIXELS_PER_SECOND, bpm),
      duration: beatDuration, // 1 beat default
      velocity: 96,
    };

    replaceClipNotes(
      track.id,
      clip.id,
      [...clip.notes, note].sort(
        (left, right) => left.startTime - right.startTime,
      ),
    );
    setSelectedNoteId(note.id);
  };

  const handleNoteMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
    noteId: string,
    isResizing: boolean = false,
  ) => {
    event.stopPropagation();
    const noteRect = event.currentTarget.getBoundingClientRect();

    // Check if clicked near the right edge for resizing
    const clickX = event.clientX - noteRect.left;
    const resizing = clickX > noteRect.width - 8;

    dragStateRef.current = {
      noteId,
      offsetX: clickX,
      offsetY: event.clientY - noteRect.top,
      isResizing: resizing || isResizing,
    };
    setSelectedNoteId(noteId);
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (velocityDragRef.current) {
      updateNoteVelocity(velocityDragRef.current.noteId, event.clientY);
      return;
    }

    if (!dragStateRef.current || !track || !clip || !containerRef.current) {
      return;
    }

    const gridRect = containerRef.current
      .querySelector(".grid-area")
      ?.getBoundingClientRect();
    if (!gridRect) return;

    const { noteId, offsetX, isResizing } = dragStateRef.current;
    const localX = event.clientX - gridRect.left;
    const localY = event.clientY - gridRect.top;

    const targetNote = clip.notes.find((n) => n.id === noteId);
    if (!targetNote) return;

    if (isResizing) {
      // Resize horizontally only
      const rawDuration =
        (localX - targetNote.startTime * PIXELS_PER_SECOND) / PIXELS_PER_SECOND;
      const snappedDuration = Math.max(
        beatDuration / 4,
        Math.round(rawDuration / (beatDuration / 4)) * (beatDuration / 4),
      );

      replaceClipNotes(
        track.id,
        clip.id,
        clip.notes.map((note) =>
          note.id === noteId ? { ...note, duration: snappedDuration } : note,
        ),
      );
    } else {
      // Move both vertically and horizontally
      const nextPitch =
        pitches[clamp(Math.floor(localY / ROW_HEIGHT), 0, pitches.length - 1)];
      const nextStartTime = Math.max(
        0,
        snapToGrid((localX - offsetX) / PIXELS_PER_SECOND, bpm),
      );

      replaceClipNotes(
        track.id,
        clip.id,
        clip.notes.map((note) =>
          note.id === noteId
            ? { ...note, pitch: nextPitch, startTime: nextStartTime }
            : note,
        ),
      );
    }
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
    velocityDragRef.current = null;
  };

  // Render timeline ruler marks
  const renderRulerMarks = () => {
    const marks = [];
    const totalBeats = Math.ceil(
      canvasWidth / PIXELS_PER_SECOND / beatDuration,
    );

    for (let i = 0; i <= totalBeats; i++) {
      const xPos = i * beatWidth;
      const isBar = i % 4 === 0;

      marks.push(
        <div
          key={`ruler-${i}`}
          className="absolute top-0 bottom-0 border-l border-slate-700/80"
          style={{
            left: `${xPos}px`,
            height: isBar ? "100%" : "30%",
            top: isBar ? "0" : "auto",
            bottom: "0",
          }}
        >
          {isBar && (
            <span className="absolute left-1.5 top-1 text-[10px] font-semibold text-slate-400 select-none">
              {i / 4 + 1}
            </span>
          )}
        </div>,
      );
    }
    return marks;
  };

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,hsl(var(--daw-surface-3)),hsl(var(--daw-surface-2)))]">
      {/* Header */}
      <div className="relative z-30 flex shrink-0 items-center justify-between border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(37,42,54,0.96),rgba(26,30,40,0.96))] px-4 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="daw-panel-title text-slate-300">
            Piano Roll
          </h2>
          <div className="h-4 w-px bg-white/10"></div>
          <p className="text-xs font-semibold text-slate-100">
            {track?.name || "No track selected"}
          </p>
        </div>
        {clip && (
          <span className="rounded-full bg-white/6 px-3 py-1 font-mono text-[10px] font-medium tracking-[0.08em] text-slate-300">
            Click to add. Drag to move, trim, and set velocity.
          </span>
        )}
      </div>

      {!track || !clip ? (
        <div className="flex flex-1 items-center justify-center bg-[hsl(var(--daw-surface-2))] p-8">
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-8 py-12 text-center text-sm font-medium text-slate-400 shadow-inner">
            Import MIDI or add a track to open the piano roll.
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative flex-1 overflow-auto bg-[hsl(var(--daw-surface-2))]"
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        >
          {/* Virtual Canvas */}
          <div
            style={{
              width: `${PIANO_WIDTH + canvasWidth}px`,
              height: `${canvasHeight + RULER_HEIGHT + VELOCITY_HEIGHT}px`,
            }}
            className="relative"
          >
            {/* Top-Left Corner (Sticky) */}
            <div className="sticky left-0 top-0 z-40 h-[28px] w-[72px] border-b border-r border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(42,48,60,0.96),rgba(31,37,50,0.96))] shadow-sm backdrop-blur-md" />

            {/* Timeline Ruler (Sticky Top) */}
            <div
              className="sticky top-0 z-30 h-[28px] cursor-pointer overflow-hidden border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(42,48,60,0.96),rgba(32,36,48,0.96))] backdrop-blur-md"
              style={{ left: PIANO_WIDTH, width: canvasWidth }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                seek(Math.max(0, x / PIXELS_PER_SECOND));
              }}
            >
              {/* Ruler Marks */}
              <div className="relative h-full w-full">
                {renderRulerMarks()}
                <div
                  className="pointer-events-none absolute inset-0 opacity-45"
                  style={{
                    backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                    backgroundSize: `${beatWidth}px 100%`,
                  }}
                />

                {/* Playhead arrow in ruler */}
                <div
                  ref={rulerPlayheadRef}
                  className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 transform-gpu will-change-transform"
                  style={{ transform: `translateX(calc(var(--transport-current-time) * ${PIXELS_PER_SECOND}px))` }}
                >
                  <div className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 bg-[linear-gradient(180deg,rgba(248,113,113,0.22),rgba(248,113,113,0.06))] blur-[1px]" />
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--daw-playhead))] shadow-[0_0_12px_rgba(248,113,113,0.8)]" />
                  <div className="absolute top-[16px] left-1/2 h-[12px] w-[9px] -translate-x-1/2">
                    <svg
                      viewBox="0 0 9 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M0 0H9V6L4.5 12L0 6V0Z" fill="#F87171" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Left Keyboard (Sticky Left) */}
            <div
              className="sticky left-0 z-20 w-[72px] overflow-hidden border-r border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,#dbe4ef,#cbd7e4)] shadow-[3px_0_15px_rgba(0,0,0,0.5)]"
              style={{ top: RULER_HEIGHT, height: canvasHeight }}
            >
              <div className="relative h-full w-full">
                {pitches.map((pitch, i) => {
                  const isBlackKey = NOTE_NAMES[pitch % 12].includes("#");
                  const isC = NOTE_NAMES[pitch % 12] === "C";
                  const top = i * ROW_HEIGHT;

                  if (isBlackKey) {
                    return (
                      <button
                        key={pitch}
                        type="button"
                        className="absolute left-0 z-10 w-[44px] rounded-r-[3px] border-y border-r border-[#0F131A] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700 pr-2 text-right text-[9px] font-bold text-slate-400 shadow-[0_3px_5px_rgba(0,0,0,0.6)] transition-all hover:brightness-125 focus:brightness-125"
                        style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
                        onClick={() => seek(getTransportCurrentTime())}
                      >
                        {NOTE_NAMES[pitch % 12]}
                      </button>
                    );
                  } else {
                    return (
                      <button
                        key={pitch}
                        type="button"
                        className={`absolute left-0 flex w-full items-center justify-end border-b pr-2 text-[10px] font-bold shadow-inner transition-all hover:brightness-95 focus:brightness-95 ${isC ? "border-[#9bb7d8] bg-[#dce9f8] text-slate-700" : "border-[#CBD5E1] bg-slate-200 text-slate-500"}`}
                        style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
                        onClick={() => seek(getTransportCurrentTime())}
                      >
                        {NOTE_NAMES[pitch % 12]}
                        {Math.floor(pitch / 12) - 1}
                      </button>
                    );
                  }
                })}
              </div>
            </div>

            <div
              className="absolute"
              style={{
                left: PIANO_WIDTH,
                top: RULER_HEIGHT,
                width: canvasWidth,
                height: canvasHeight,
              }}
              onClick={handleGridClick}
            >
              {/* Horizontal Pitch Backgrounds */}
              {pitches.map((pitch, i) => {
                const isBlackKey = NOTE_NAMES[pitch % 12].includes("#");
                const isC = NOTE_NAMES[pitch % 12] === "C";
                return (
                  <div
                    key={`bg-${pitch}`}
                    className={`absolute w-full border-b ${isBlackKey ? "bg-[#101318] border-transparent" : "bg-[#1A1D24] border-[#232b38]"}`}
                    style={{
                      top: i * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                      ...(isC && {
                        backgroundColor: "hsl(var(--daw-c-note))",
                        borderBottomColor: "#66a7d9",
                        borderBottomWidth: "2px",
                      }),
                    }}
                  />
                );
              })}

              {/* Vertical Beat Lines (Using repeating linear gradient for performance) */}
              <div
                className="absolute inset-0 pointer-events-none opacity-45 mix-blend-screen"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                  backgroundSize: `${barWidth}px 100%, ${beatWidth}px 100%`,
                }}
              />

              {/* Drawn Notes */}
              {clip.notes.map((note) => {
                const pitchIndex = pitches.findIndex(
                  (pitch) => pitch === note.pitch,
                );
                if (pitchIndex === -1) {
                  return null;
                }

                const isSelected = selectedNoteId === note.id;

                return (
                  <div
                    key={note.id}
                    className={`absolute cursor-move select-none rounded-[3px] border text-left text-[9px] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-all ${
                      isSelected
                        ? "z-10 border-cyan-100 bg-gradient-to-b from-cyan-300 to-cyan-500 text-white shadow-[0_0_12px_rgba(34,211,238,0.5)] ring-1 ring-cyan-200/70"
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
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 top-0 w-1 rounded-l-[2px] bg-white/50"
                      style={{ opacity: Math.max(0.28, note.velocity / 127) }}
                    />

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
                );
              })}

              {/* Playhead Vertical Line */}
              <div
                ref={gridPlayheadRef}
                className="pointer-events-none absolute bottom-0 top-0 left-0 z-20 transform-gpu will-change-transform"
                style={{ transform: `translateX(calc(var(--transport-current-time) * ${PIXELS_PER_SECOND}px))` }}
              >
                <div className="absolute inset-y-0 -left-2 w-4 bg-[linear-gradient(180deg,rgba(248,113,113,0.18),rgba(248,113,113,0.04))]" />
                <div className="absolute inset-y-0 left-0 w-px bg-[hsl(var(--daw-playhead))] shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
              </div>
            </div>

            <div
              className="sticky left-0 z-20 flex w-[72px] items-center justify-end border-r border-t border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,#ced9e6,#bcc9d8)] px-2 shadow-[3px_0_15px_rgba(0,0,0,0.35)]"
              style={{
                top: RULER_HEIGHT + canvasHeight,
                height: VELOCITY_HEIGHT,
              }}
            >
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  Vel
                </p>
                <p className="font-mono text-[10px] text-slate-500">
                  {selectedNoteId
                    ? clip.notes.find((note) => note.id === selectedNoteId)?.velocity ?? 0
                    : "--"}
                </p>
              </div>
            </div>

            <div
              ref={velocityLaneRef}
              className="absolute left-[72px] z-10 overflow-hidden border-t border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(17,20,28,0.92),rgba(10,14,20,0.98))]"
              style={{
                top: RULER_HEIGHT + canvasHeight,
                width: canvasWidth,
                height: VELOCITY_HEIGHT,
              }}
              onMouseLeave={handlePointerUp}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to top, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                  backgroundSize: `${barWidth}px 100%, ${beatWidth}px 100%, 100% 24px`,
                }}
              />
              {clip.notes.map((note) => {
                const left = note.startTime * PIXELS_PER_SECOND;
                const width = Math.max(8, note.duration * PIXELS_PER_SECOND - 2);
                const isSelected = selectedNoteId === note.id;
                const barHeight = Math.max(10, (note.velocity / 127) * (VELOCITY_HEIGHT - 14));

                return (
                  <button
                    key={`velocity-${note.id}`}
                    type="button"
                    className={`absolute bottom-2 rounded-t-md border border-cyan-400/30 bg-[linear-gradient(180deg,rgba(103,232,249,0.92),rgba(8,145,178,0.72))] ${isSelected ? "shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_14px_rgba(34,211,238,0.28)]" : "opacity-80 hover:opacity-100"}`}
                    style={{
                      left,
                      width,
                      height: barHeight,
                    }}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      setSelectedNoteId(note.id);
                      velocityDragRef.current = { noteId: note.id };
                      updateNoteVelocity(note.id, event.clientY);
                    }}
                    aria-label={`Velocity for ${NOTE_NAMES[note.pitch % 12]} ${note.velocity}`}
                  />
                );
              })}
              <div
                ref={velocityPlayheadRef}
                className="pointer-events-none absolute inset-y-0 left-0 z-20 transform-gpu will-change-transform"
                style={{ transform: `translateX(calc(var(--transport-current-time) * ${PIXELS_PER_SECOND}px))` }}
              >
                <div className="absolute inset-y-0 left-0 w-px bg-[hsl(var(--daw-playhead))] shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MidiPianoRoll;
