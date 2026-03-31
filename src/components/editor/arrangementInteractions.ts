import type { ProjectTool } from "@/types";
import type { GridDivision } from "@/utils/grid";
import { snapTimeToGrid } from "@/utils/grid";

const CLIP_EDGE_HANDLE_WIDTH_PX = 10;
const MIN_CLIP_DURATION_SECONDS = 0.05;

export type ArrangementDragAction = "move" | "trim-start" | "trim-end";

export interface ArrangementClipSnapshot {
  id: string;
  startTime: number;
  duration: number;
}

export interface ArrangementDragState {
  action: ArrangementDragAction;
  trackId: string;
  clipId: string;
  originStartTime: number;
  originDuration: number;
  pointerStartX: number;
}

export interface ArrangementDragPreview {
  trackId: string;
  clipId: string;
  startTime: number;
  duration: number;
  action: ArrangementDragAction;
}

interface ResolveClipDragActionParams {
  activeTool: ProjectTool;
  localX: number;
  clipWidth: number;
}

interface GetSplitClipTimeParams {
  clipStartTime: number;
  localX: number;
  zoom: number;
  bpm: number;
  gridDivision: GridDivision;
  disableSnap: boolean;
}

interface GetArrangementDragPreviewParams {
  dragState: ArrangementDragState;
  pointerClientX: number;
  zoom: number;
  bpm: number;
  gridDivision: GridDivision;
  disableSnap: boolean;
}

export const resolveClipDragAction = ({
  activeTool,
  localX,
  clipWidth,
}: ResolveClipDragActionParams): ArrangementDragAction | null => {
  const nearStart = localX <= CLIP_EDGE_HANDLE_WIDTH_PX;
  const nearEnd = clipWidth - localX <= CLIP_EDGE_HANDLE_WIDTH_PX;

  if (nearStart) {
    return "trim-start";
  }

  if (nearEnd) {
    return "trim-end";
  }

  if (activeTool === "pointer") {
    return "move";
  }

  return null;
};

export const getSplitClipTime = ({
  clipStartTime,
  localX,
  zoom,
  bpm,
  gridDivision,
  disableSnap,
}: GetSplitClipTimeParams) =>
  snapTimeToGrid(
    clipStartTime + localX / zoom,
    bpm,
    gridDivision,
    disableSnap,
  );

export const createArrangementDragState = (
  trackId: string,
  clip: ArrangementClipSnapshot,
  action: ArrangementDragAction,
  pointerStartX: number,
): ArrangementDragState => ({
  action,
  trackId,
  clipId: clip.id,
  originStartTime: clip.startTime,
  originDuration: clip.duration,
  pointerStartX,
});

export const createArrangementDragPreview = (
  dragState: ArrangementDragState,
): ArrangementDragPreview => ({
  trackId: dragState.trackId,
  clipId: dragState.clipId,
  startTime: dragState.originStartTime,
  duration: dragState.originDuration,
  action: dragState.action,
});

export const getArrangementDragPreview = ({
  dragState,
  pointerClientX,
  zoom,
  bpm,
  gridDivision,
  disableSnap,
}: GetArrangementDragPreviewParams): ArrangementDragPreview => {
  const deltaSeconds = (pointerClientX - dragState.pointerStartX) / zoom;

  if (dragState.action === "move") {
    return {
      trackId: dragState.trackId,
      clipId: dragState.clipId,
      action: dragState.action,
      startTime: snapTimeToGrid(
        dragState.originStartTime + deltaSeconds,
        bpm,
        gridDivision,
        disableSnap,
      ),
      duration: dragState.originDuration,
    };
  }

  if (dragState.action === "trim-start") {
    const nextStartTime = Math.min(
      dragState.originStartTime + dragState.originDuration -
        MIN_CLIP_DURATION_SECONDS,
      snapTimeToGrid(
        dragState.originStartTime + deltaSeconds,
        bpm,
        gridDivision,
        disableSnap,
      ),
    );
    const clampedStartTime = Math.max(0, nextStartTime);

    return {
      trackId: dragState.trackId,
      clipId: dragState.clipId,
      action: dragState.action,
      startTime: clampedStartTime,
      duration: Math.max(
        MIN_CLIP_DURATION_SECONDS,
        dragState.originDuration -
          (clampedStartTime - dragState.originStartTime),
      ),
    };
  }

  const rawEndTime =
    dragState.originStartTime + dragState.originDuration + deltaSeconds;
  const snappedEndTime = snapTimeToGrid(
    rawEndTime,
    bpm,
    gridDivision,
    disableSnap,
  );

  return {
    trackId: dragState.trackId,
    clipId: dragState.clipId,
    action: dragState.action,
    startTime: dragState.originStartTime,
    duration: Math.max(
      MIN_CLIP_DURATION_SECONDS,
      snappedEndTime - dragState.originStartTime,
    ),
  };
};