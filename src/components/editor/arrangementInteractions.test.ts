import assert from "node:assert/strict";
import test from "node:test";
import {
  createArrangementDragPreview,
  createArrangementDragState,
  getArrangementDragPreview,
  getSplitClipTime,
  resolveClipDragAction,
} from "@/components/editor/arrangementInteractions";

test("resolveClipDragAction prioritizes trim handles before move", () => {
  assert.equal(
    resolveClipDragAction({
      activeTool: "pointer",
      localX: 4,
      clipWidth: 120,
    }),
    "trim-start",
  );

  assert.equal(
    resolveClipDragAction({
      activeTool: "pointer",
      localX: 118,
      clipWidth: 120,
    }),
    "trim-end",
  );

  assert.equal(
    resolveClipDragAction({
      activeTool: "pointer",
      localX: 40,
      clipWidth: 120,
    }),
    "move",
  );

  assert.equal(
    resolveClipDragAction({
      activeTool: "trim",
      localX: 40,
      clipWidth: 120,
    }),
    null,
  );
});

test("getSplitClipTime snaps split position to the grid", () => {
  assert.equal(
    getSplitClipTime({
      clipStartTime: 1,
      localX: 42,
      zoom: 56,
      bpm: 120,
      gridDivision: "1/4",
      disableSnap: false,
    }),
    2,
  );
});

test("getArrangementDragPreview moves clips using snapped start time", () => {
  const dragState = createArrangementDragState(
    "track-1",
    { id: "clip-1", startTime: 1, duration: 2 },
    "move",
    100,
  );

  assert.deepEqual(createArrangementDragPreview(dragState), {
    action: "move",
    clipId: "clip-1",
    duration: 2,
    startTime: 1,
    trackId: "track-1",
  });

  assert.deepEqual(
    getArrangementDragPreview({
      dragState,
      pointerClientX: 128,
      zoom: 56,
      bpm: 120,
      gridDivision: "1/4",
      disableSnap: false,
    }),
    {
      action: "move",
      clipId: "clip-1",
      duration: 2,
      startTime: 1.5,
      trackId: "track-1",
    },
  );
});

test("getArrangementDragPreview clamps trim-start and trim-end durations", () => {
  const trimStartState = createArrangementDragState(
    "track-1",
    { id: "clip-1", startTime: 0.5, duration: 1 },
    "trim-start",
    0,
  );
  const trimEndState = createArrangementDragState(
    "track-1",
    { id: "clip-2", startTime: 1, duration: 1 },
    "trim-end",
    0,
  );

  assert.deepEqual(
    getArrangementDragPreview({
      dragState: trimStartState,
      pointerClientX: -200,
      zoom: 100,
      bpm: 120,
      gridDivision: "1/16",
      disableSnap: true,
    }),
    {
      action: "trim-start",
      clipId: "clip-1",
      duration: 1.5,
      startTime: 0,
      trackId: "track-1",
    },
  );

  assert.deepEqual(
    getArrangementDragPreview({
      dragState: trimEndState,
      pointerClientX: -500,
      zoom: 100,
      bpm: 120,
      gridDivision: "1/16",
      disableSnap: true,
    }),
    {
      action: "trim-end",
      clipId: "clip-2",
      duration: 0.05,
      startTime: 1,
      trackId: "track-1",
    },
  );
});