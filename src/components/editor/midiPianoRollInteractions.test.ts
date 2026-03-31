import assert from "node:assert/strict";
import test from "node:test";
import type { MidiNote } from "@/types";
import {
  canSplitMidiNote,
  clampMidiVelocity,
  createMidiNoteFromGridClick,
  getMidiNoteMovePatch,
  getMidiNoteResizePatch,
  getMidiNoteSplitTime,
  getMidiSplitPreview,
  getMidiVelocityFromLanePosition,
  resolveMidiNoteDragState,
  splitMidiNote,
} from "@/components/editor/midiPianoRollInteractions";

const baseNote: MidiNote = {
  id: "note-1",
  pitch: 60,
  startTime: 1,
  duration: 1,
  velocity: 96,
};

test("createMidiNoteFromGridClick snaps note start and selects pitch row", () => {
  assert.deepEqual(
    createMidiNoteFromGridClick({
      localX: 54,
      localY: 42,
      pitches: [72, 71, 70, 69],
      rowHeight: 20,
      pixelsPerSecond: 96,
      bpm: 120,
      gridDivision: "1/4",
      beatDuration: 0.5,
      noteId: "new-note",
    }),
    {
      id: "new-note",
      pitch: 70,
      startTime: 0.5,
      duration: 0.5,
      velocity: 96,
    },
  );
});

test("resolveMidiNoteDragState detects resize handles and trim tool", () => {
  assert.deepEqual(
    resolveMidiNoteDragState({
      activeTool: "pointer",
      noteId: "note-1",
      clickX: 24,
      noteWidth: 30,
      forceResize: false,
      pointerOffsetY: 6,
    }),
    {
      noteId: "note-1",
      offsetX: 24,
      offsetY: 6,
      isResizing: true,
    },
  );

  assert.equal(
    resolveMidiNoteDragState({
      activeTool: "trim",
      noteId: "note-1",
      clickX: 3,
      noteWidth: 30,
      forceResize: false,
      pointerOffsetY: 6,
    }).isResizing,
    true,
  );
});

test("move and resize note patches stay snapped and clamped", () => {
  const dragState = {
    noteId: "note-1",
    offsetX: 12,
    offsetY: 5,
    isResizing: false,
  };

  assert.deepEqual(
    getMidiNoteMovePatch({
      note: baseNote,
      dragState,
      localX: 84,
      localY: 49,
      pitches: [72, 71, 70, 69],
      rowHeight: 20,
      pixelsPerSecond: 96,
      bpm: 120,
      gridDivision: "1/4",
      disableSnap: false,
    }),
    {
      pitch: 70,
      startTime: 1,
    },
  );

  assert.deepEqual(
    getMidiNoteResizePatch({
      note: baseNote,
      localX: 70,
      pixelsPerSecond: 96,
      bpm: 120,
      gridDivision: "1/16",
      gridStep: 0.125,
      disableSnap: true,
    }),
    {
      duration: 0.125,
    },
  );
});

test("split helpers validate split points and build preview", () => {
  const splitTime = getMidiNoteSplitTime({
    note: baseNote,
    localX: 48,
    pixelsPerSecond: 96,
    bpm: 120,
    gridDivision: "1/4",
    disableSnap: false,
  });

  assert.equal(splitTime, 1.5);
  assert.equal(canSplitMidiNote(baseNote, splitTime), true);
  assert.equal(canSplitMidiNote(baseNote, 1), false);

  assert.deepEqual(
    getMidiSplitPreview({
      note: baseNote,
      localX: 48,
      pixelsPerSecond: 96,
      bpm: 120,
      gridDivision: "1/4",
      disableSnap: false,
    }),
    {
      noteId: "note-1",
      left: 144,
    },
  );
});

test("splitMidiNote replaces one note with two segments", () => {
  assert.deepEqual(
    splitMidiNote({
      notes: [baseNote],
      noteId: "note-1",
      splitTime: 1.25,
      nextNoteId: "note-2",
    }),
    [
      {
        ...baseNote,
        duration: 0.25,
      },
      {
        ...baseNote,
        id: "note-2",
        startTime: 1.25,
        duration: 0.75,
      },
    ],
  );
});

test("velocity helpers clamp lane-derived values into midi range", () => {
  assert.equal(getMidiVelocityFromLanePosition(100, 100, 96), 127);
  assert.equal(getMidiVelocityFromLanePosition(196, 100, 96), 20);
  assert.equal(clampMidiVelocity(180), 127);
  assert.equal(clampMidiVelocity(2), 20);
});