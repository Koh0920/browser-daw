import type { GridDivision } from "@/utils/grid";
import { snapTimeToGrid } from "@/utils/grid";
import type { MidiNote, ProjectTool } from "@/types";

const NOTE_RESIZE_HANDLE_WIDTH_PX = 8;
const MIN_NOTE_VELOCITY = 20;
const MAX_NOTE_VELOCITY = 127;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export interface MidiNoteDragState {
  noteId: string;
  offsetX: number;
  offsetY: number;
  isResizing: boolean;
}

export interface MidiSplitPreview {
  noteId: string;
  left: number;
}

interface CreateMidiNoteParams {
  localX: number;
  localY: number;
  pitches: number[];
  rowHeight: number;
  pixelsPerSecond: number;
  bpm: number;
  gridDivision: GridDivision;
  beatDuration: number;
  noteId: string;
}

interface ResolveMidiNoteDragStateParams {
  activeTool: ProjectTool;
  noteId: string;
  clickX: number;
  noteWidth: number;
  forceResize: boolean;
  pointerOffsetY: number;
}

interface GetMidiNoteMovePatchParams {
  note: MidiNote;
  dragState: MidiNoteDragState;
  localX: number;
  localY: number;
  pitches: number[];
  rowHeight: number;
  pixelsPerSecond: number;
  bpm: number;
  gridDivision: GridDivision;
  disableSnap: boolean;
}

interface GetMidiNoteResizePatchParams {
  note: MidiNote;
  localX: number;
  pixelsPerSecond: number;
  bpm: number;
  gridDivision: GridDivision;
  gridStep: number;
  disableSnap: boolean;
}

interface GetMidiNoteSplitTimeParams {
  note: MidiNote;
  localX: number;
  pixelsPerSecond: number;
  bpm: number;
  gridDivision: GridDivision;
  disableSnap: boolean;
}

interface SplitMidiNoteParams {
  notes: MidiNote[];
  noteId: string;
  splitTime: number;
  nextNoteId: string;
}

interface GetMidiSplitPreviewParams {
  note: MidiNote;
  localX: number;
  pixelsPerSecond: number;
  bpm: number;
  gridDivision: GridDivision;
  disableSnap: boolean;
}

export const createMidiNoteFromGridClick = ({
  localX,
  localY,
  pitches,
  rowHeight,
  pixelsPerSecond,
  bpm,
  gridDivision,
  beatDuration,
  noteId,
}: CreateMidiNoteParams): MidiNote => {
  const pitchIndex = clamp(Math.floor(localY / rowHeight), 0, pitches.length - 1);

  return {
    id: noteId,
    pitch: pitches[pitchIndex],
    startTime: snapTimeToGrid(localX / pixelsPerSecond, bpm, gridDivision),
    duration: beatDuration,
    velocity: 96,
  };
};

export const resolveMidiNoteDragState = ({
  activeTool,
  noteId,
  clickX,
  noteWidth,
  forceResize,
  pointerOffsetY,
}: ResolveMidiNoteDragStateParams): MidiNoteDragState => ({
  noteId,
  offsetX: clickX,
  offsetY: pointerOffsetY,
  isResizing:
    activeTool === "trim" || forceResize || clickX > noteWidth - NOTE_RESIZE_HANDLE_WIDTH_PX,
});

export const getMidiNoteMovePatch = ({
  dragState,
  localX,
  localY,
  pitches,
  rowHeight,
  pixelsPerSecond,
  bpm,
  gridDivision,
  disableSnap,
}: GetMidiNoteMovePatchParams) => ({
  pitch:
    pitches[
      clamp(
        Math.floor((localY - dragState.offsetY) / rowHeight),
        0,
        pitches.length - 1,
      )
    ],
  startTime: Math.max(
    0,
    snapTimeToGrid(
      (localX - dragState.offsetX) / pixelsPerSecond,
      bpm,
      gridDivision,
      disableSnap,
    ),
  ),
});

export const getMidiNoteResizePatch = ({
  note,
  localX,
  pixelsPerSecond,
  bpm,
  gridDivision,
  gridStep,
  disableSnap,
}: GetMidiNoteResizePatchParams) => ({
  duration: Math.max(
    gridStep,
    snapTimeToGrid(
      (localX - note.startTime * pixelsPerSecond) / pixelsPerSecond,
      bpm,
      gridDivision,
      disableSnap,
    ),
  ),
});

export const getMidiNoteSplitTime = ({
  note,
  localX,
  pixelsPerSecond,
  bpm,
  gridDivision,
  disableSnap,
}: GetMidiNoteSplitTimeParams) =>
  snapTimeToGrid(
    note.startTime + localX / pixelsPerSecond,
    bpm,
    gridDivision,
    disableSnap,
  );

export const canSplitMidiNote = (note: MidiNote, splitTime: number) => {
  const relativeSplit = splitTime - note.startTime;
  return relativeSplit > 0 && relativeSplit < note.duration;
};

export const splitMidiNote = ({
  notes,
  noteId,
  splitTime,
  nextNoteId,
}: SplitMidiNoteParams): MidiNote[] =>
  notes.flatMap((note) => {
    if (note.id !== noteId) {
      return [note];
    }

    const relativeSplit = splitTime - note.startTime;
    if (!canSplitMidiNote(note, splitTime)) {
      return [note];
    }

    return [
      {
        ...note,
        duration: relativeSplit,
      },
      {
        ...note,
        id: nextNoteId,
        startTime: splitTime,
        duration: note.duration - relativeSplit,
      },
    ];
  });

export const getMidiSplitPreview = ({
  note,
  localX,
  pixelsPerSecond,
  bpm,
  gridDivision,
  disableSnap,
}: GetMidiSplitPreviewParams): MidiSplitPreview | null => {
  const splitTime = getMidiNoteSplitTime({
    note,
    localX,
    pixelsPerSecond,
    bpm,
    gridDivision,
    disableSnap,
  });

  if (!canSplitMidiNote(note, splitTime)) {
    return null;
  }

  return {
    noteId: note.id,
    left: splitTime * pixelsPerSecond,
  };
};

export const getMidiVelocityFromLanePosition = (
  clientY: number,
  laneTop: number,
  laneHeight: number,
) => {
  const normalized = 1 - clamp((clientY - laneTop) / laneHeight, 0, 1);
  return Math.round(MIN_NOTE_VELOCITY + normalized * 107);
};

export const clampMidiVelocity = (velocity: number) =>
  clamp(velocity, MIN_NOTE_VELOCITY, MAX_NOTE_VELOCITY);