import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useTransport } from "@/hooks/useTransport";
import { useProjectStore } from "@/stores/projectStore";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import type { GridDivision } from "@/utils/grid";
import { getGridStepSeconds, snapTimeToGrid } from "@/utils/grid";
import { formatTime } from "@/utils/timeFormat";

const TRACK_HEIGHT = 84;
const TRACK_HEADER_WIDTH = 292;
const RULER_HEIGHT = 34;
const MIN_ZOOM = 32;
const MAX_ZOOM = 160;
const AUTOSCROLL_INTERVAL_MS = 120;
const AUTOSCROLL_LEAD_RATIO = 0.14;
const AUTOSCROLL_TRAIL_RATIO = 0.08;
const AUTOSCROLL_TARGET_RATIO = 0.28;
const MIN_AUTOSCROLL_DELTA_PX = 72;

interface ArrangementViewProps {
  gridDivision?: GridDivision;
}

const getClipGradient = (isAudio: boolean) =>
  isAudio
    ? "linear-gradient(180deg, rgba(251, 146, 60, 0.96) 0%, rgba(194, 65, 12, 0.88) 100%)"
    : "linear-gradient(180deg, rgba(103, 232, 249, 0.96) 0%, rgba(8, 145, 178, 0.88) 100%)";

const resolveTrackColor = (trackColor: string | undefined, isAudio: boolean) =>
  `hsl(${trackColor ?? (isAudio ? "24 96% 63%" : "190 92% 56%")})`;

export const ArrangementView = ({
  gridDivision = "1/16",
}: ArrangementViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(56);
  const isPlayingRef = useRef(false);
  const autoScrollTargetRef = useRef<number | null>(null);
  const lastAutoscrollAtRef = useRef(0);
  const dragStateRef = useRef<{
    action: "move" | "trim-start" | "trim-end";
    trackId: string;
    clipId: string;
    originStartTime: number;
    originDuration: number;
    pointerStartX: number;
  } | null>(null);
  const [zoom, setZoom] = useState(56);
  const [dragPreview, setDragPreview] = useState<{
    trackId: string;
    clipId: string;
    startTime: number;
    duration: number;
    action: "move" | "trim-start" | "trim-end";
  } | null>(null);
  const currentProject = useProjectStore((state) => state.currentProject);
  const activeTool = useProjectStore((state) => state.activeTool);
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId);
  const selectedClipId = useProjectStore((state) => state.selectedClipId);
  const moveClip = useProjectStore((state) => state.moveClip);
  const selectTrack = useProjectStore((state) => state.selectTrack);
  const selectClip = useProjectStore((state) => state.selectClip);
  const removeTrack = useProjectStore((state) => state.removeTrack);
  const splitClip = useProjectStore((state) => state.splitClip);
  const toggleTrackRecordArm = useProjectStore(
    (state) => state.toggleTrackRecordArm,
  );
  const trimClip = useProjectStore((state) => state.trimClip);
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const { isPlaying, isRecording, recordingTrackId, seekTo } = useTransport();

  const duration = currentProject?.duration ?? 60;
  const bpm = currentProject?.bpm ?? 120;
  const beatsPerBar = currentProject?.timeSignatureNumerator ?? 4;
  const beatUnit = currentProject?.timeSignatureDenominator ?? 4;
  const beatDuration = 60 / Math.max(bpm, 1);
  const barDuration = beatDuration * beatsPerBar;
  const gridStep = getGridStepSeconds(bpm, gridDivision);
  const gridWidth = gridStep * zoom;
  const barWidth = barDuration * zoom;
  const canvasWidth = Math.max(duration * zoom, 1200);
  const tracksHeight = Math.max(
    (currentProject?.tracks.length ?? 0) * TRACK_HEIGHT,
    TRACK_HEIGHT,
  );

  const markers = useMemo(() => {
    const nextMarkers = [];

    for (
      let barIndex = 0;
      barIndex <= Math.ceil(duration / barDuration);
      barIndex += 1
    ) {
      const left = barIndex * barWidth;
      nextMarkers.push(
        <div
          key={barIndex}
          className="absolute inset-y-0 border-l border-[hsl(var(--daw-grid-strong)/0.72)]"
          style={{ left: `${left}px` }}
        >
          <span className="absolute left-2 top-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-slate-300">
            {barIndex + 1}
          </span>
        </div>,
      );
    }

    return nextMarkers;
  }, [barDuration, barWidth, duration]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    dragStateRef.current = null;
    setDragPreview(null);
  }, [activeTool]);

  useEffect(() => {
    const updatePlayhead = (time: number) => {
      const playheadX = time * zoomRef.current;
      const scrollElement = scrollRef.current;

      if (!scrollElement || !isPlayingRef.current) {
        return;
      }

      const now = performance.now();
      if (now - lastAutoscrollAtRef.current < AUTOSCROLL_INTERVAL_MS) {
        return;
      }
      lastAutoscrollAtRef.current = now;

      const viewportStart = scrollElement.scrollLeft;
      const viewportWidth = Math.max(
        0,
        scrollElement.clientWidth - TRACK_HEADER_WIDTH,
      );
      const viewportEnd = viewportStart + viewportWidth;
      const lead = viewportWidth * AUTOSCROLL_LEAD_RATIO;
      const trail = viewportWidth * AUTOSCROLL_TRAIL_RATIO;

      if (playheadX > viewportEnd - lead || playheadX < viewportStart + trail) {
        const nextScrollLeft = Math.max(
          0,
          playheadX - viewportWidth * AUTOSCROLL_TARGET_RATIO,
        );

        if (
          autoScrollTargetRef.current === null ||
          Math.abs(nextScrollLeft - autoScrollTargetRef.current) >
            MIN_AUTOSCROLL_DELTA_PX
        ) {
          autoScrollTargetRef.current = nextScrollLeft;
        }

        if (
          Math.abs(scrollElement.scrollLeft - autoScrollTargetRef.current) >
          MIN_AUTOSCROLL_DELTA_PX
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

  if (!currentProject) {
    return null;
  }

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    seekTo(Math.max(0, offsetX / zoom));
  };

  const handleClipPointerDown = (
    event: React.MouseEvent<HTMLButtonElement>,
    trackId: string,
    clip: { id: string; startTime: number; duration: number },
  ) => {
    event.stopPropagation();
    selectTrack(trackId);
    selectClip(clip.id);

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const nearStart = localX <= 10;
    const nearEnd = rect.width - localX <= 10;

    if (activeTool === "split") {
      const splitAt = snapTimeToGrid(
        clip.startTime + localX / zoom,
        bpm,
        gridDivision,
        event.altKey,
      );
      splitClip(trackId, clip.id, splitAt);
      return;
    }

    let action: "move" | "trim-start" | "trim-end" | null = null;
    if (nearStart) {
      action = "trim-start";
    } else if (nearEnd) {
      action = "trim-end";
    } else if (activeTool === "pointer") {
      action = "move";
    }

    if (!action) {
      return;
    }

    dragStateRef.current = {
      action,
      trackId,
      clipId: clip.id,
      originStartTime: clip.startTime,
      originDuration: clip.duration,
      pointerStartX: event.clientX,
    };
    setDragPreview({
      trackId,
      clipId: clip.id,
      startTime: clip.startTime,
      duration: clip.duration,
      action,
    });
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const deltaSeconds = (event.clientX - dragState.pointerStartX) / zoom;
    const disableSnap = event.altKey;

    if (dragState.action === "move") {
      const nextStartTime = snapTimeToGrid(
        dragState.originStartTime + deltaSeconds,
        bpm,
        gridDivision,
        disableSnap,
      );
      setDragPreview({
        ...dragState,
        startTime: nextStartTime,
        duration: dragState.originDuration,
      });
      return;
    }

    if (dragState.action === "trim-start") {
      const nextStartTime = Math.min(
        dragState.originStartTime + dragState.originDuration - 0.05,
        snapTimeToGrid(
          dragState.originStartTime + deltaSeconds,
          bpm,
          gridDivision,
          disableSnap,
        ),
      );
      const nextDuration = Math.max(
        0.05,
        dragState.originDuration - (nextStartTime - dragState.originStartTime),
      );

      setDragPreview({
        ...dragState,
        startTime: Math.max(0, nextStartTime),
        duration: nextDuration,
      });
      return;
    }

    const rawEndTime =
      dragState.originStartTime + dragState.originDuration + deltaSeconds;
    const snappedEndTime = snapTimeToGrid(
      rawEndTime,
      bpm,
      gridDivision,
      disableSnap,
    );
    const nextDuration = Math.max(
      0.05,
      snappedEndTime - dragState.originStartTime,
    );

    setDragPreview({
      ...dragState,
      startTime: dragState.originStartTime,
      duration: nextDuration,
    });
  };

  const handlePointerUp = () => {
    const dragState = dragStateRef.current;
    const preview = dragPreview;

    if (dragState && preview) {
      if (preview.action === "move") {
        moveClip(preview.trackId, preview.clipId, preview.startTime);
      } else {
        trimClip(
          preview.trackId,
          preview.clipId,
          preview.startTime,
          preview.duration,
          preview.action === "trim-start" ? "start" : "end",
        );
      }
    }

    dragStateRef.current = null;
    setDragPreview(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,hsl(var(--daw-surface-3)),hsl(var(--daw-surface-2)))] text-slate-100">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(38,45,61,0.96),rgba(24,29,41,0.96))] px-3">
        <div className="flex items-center gap-3">
          <h2 className="daw-panel-title text-slate-300">Arrangement</h2>
          <div className="h-4 w-px bg-white/12" />
          <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-slate-300">
            {beatsPerBar}/{beatUnit} • {bpm} BPM • Grid {gridDivision} •{" "}
            {formatTime(duration)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-cyan-300 disabled:opacity-40"
            onClick={() =>
              setZoom((current) => Math.max(MIN_ZOOM, current - 8))
            }
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out arrangement"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="min-w-16 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
            {zoom}px/s
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-cyan-300 disabled:opacity-40"
            onClick={() =>
              setZoom((current) => Math.min(MAX_ZOOM, current + 8))
            }
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in arrangement"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      >
        <div
          className="relative"
          style={{
            width: `${TRACK_HEADER_WIDTH + canvasWidth}px`,
            minHeight: `${RULER_HEIGHT + tracksHeight}px`,
          }}
        >
          <div
            className="sticky left-0 top-0 z-40 flex items-center justify-between border-b border-r border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(32,38,50,0.98),rgba(24,29,40,0.98))] px-4"
            style={{
              width: `${TRACK_HEADER_WIDTH}px`,
              height: `${RULER_HEIGHT}px`,
            }}
          >
            <div>
              <p className="daw-panel-title text-slate-300">Track Stack</p>
              <p className="font-mono text-[10px] text-slate-400">
                Unified scroll for headers and clips
              </p>
            </div>
            <span className="rounded-full bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-300">
              {currentProject.tracks.length}
            </span>
          </div>

          <div
            className="sticky top-0 z-30 h-[34px] overflow-hidden border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(34,40,54,0.98),rgba(27,32,44,0.98))]"
            style={{
              marginLeft: `${TRACK_HEADER_WIDTH}px`,
              width: `${canvasWidth}px`,
            }}
            onClick={handleSeek}
          >
            {markers}
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)",
                backgroundSize: `${gridWidth}px 100%`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-20 transform-gpu will-change-transform"
              style={{
                transform: `translateX(calc(var(--playhead-time) * ${zoom}px))`,
              }}
            >
              <div className="absolute inset-y-0 -left-2 w-4 bg-[linear-gradient(180deg,rgba(251,113,133,0.24),rgba(251,113,133,0.06))] blur-[1px]" />
              <div className="absolute inset-y-0 left-0 w-px bg-[hsl(var(--daw-playhead))] shadow-[0_0_16px_rgba(251,113,133,0.85)]" />
              <svg
                viewBox="0 0 9 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute left-0 top-0 -translate-x-1/2"
              >
                <path d="M0 0H9V6L4.5 12L0 6V0Z" fill="#fb7185" />
              </svg>
            </div>
          </div>

          {currentProject.tracks.length === 0 ? (
            <div className="flex min-h-[280px] items-center justify-center px-6 pb-8 pt-16">
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/18 px-10 py-12 text-center shadow-[0_20px_40px_rgba(0,0,0,0.22)]">
                <p className="font-display text-lg text-slate-100">
                  No tracks in the arrangement
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Add a MIDI or audio track from the header to start building
                  the timeline.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{ paddingTop: `${RULER_HEIGHT}px` }}
            >
              <div
                className="pointer-events-none absolute top-0 opacity-32"
                style={{
                  left: `${TRACK_HEADER_WIDTH}px`,
                  width: `${canvasWidth}px`,
                  height: `${tracksHeight}px`,
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(4,8,15,0.55) 1px, transparent 1px)",
                  backgroundSize: `${barWidth}px 100%, ${gridWidth}px 100%, 100% ${TRACK_HEIGHT}px`,
                }}
              />
              <div
                className="pointer-events-none absolute top-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.18),transparent_40%)]"
                style={{
                  left: `${TRACK_HEADER_WIDTH}px`,
                  width: `${canvasWidth}px`,
                  height: `${tracksHeight}px`,
                }}
              />
              <div
                className="pointer-events-none absolute top-0 left-0 z-30 transform-gpu will-change-transform"
                style={{
                  transform: `translateX(calc(${TRACK_HEADER_WIDTH}px + (var(--playhead-time) * ${zoom}px)))`,
                  height: `${tracksHeight}px`,
                }}
              >
                <div className="absolute inset-y-0 -left-2 w-4 bg-[linear-gradient(180deg,rgba(251,113,133,0.18),rgba(251,113,133,0.04))]" />
                <div className="absolute inset-y-0 left-0 w-px bg-[hsl(var(--daw-playhead))] shadow-[0_0_16px_rgba(251,113,133,0.85)]" />
              </div>

              {currentProject.tracks.map((track, trackIndex) => {
                const isTrackSelected = track.id === selectedTrackId;
                const trackColor = resolveTrackColor(
                  track.trackColor,
                  track.type === "audio",
                );

                return (
                  <div
                    key={track.id}
                    className={`relative flex border-b border-black/20 ${isTrackSelected ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.12),rgba(34,211,238,0.03))]" : "hover:bg-white/[0.03]"}`}
                    style={{ height: `${TRACK_HEIGHT}px` }}
                  >
                    <div
                      className="sticky left-0 z-20 shrink-0 border-r border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(21,27,38,0.98),rgba(15,19,28,0.98))] shadow-[18px_0_32px_rgba(0,0,0,0.18)]"
                      style={{ width: `${TRACK_HEADER_WIDTH}px` }}
                    >
                      <div
                        className="group relative flex h-full cursor-pointer flex-col justify-center px-4 py-3 text-left transition-all"
                        onClick={() => {
                          selectTrack(track.id);
                          selectClip(null);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectTrack(track.id);
                            selectClip(null);
                          }
                        }}
                      >
                        <div
                          className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                          style={{ backgroundColor: trackColor }}
                        />
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[10px] font-bold uppercase text-slate-100"
                                style={{ backgroundColor: trackColor }}
                              >
                                {track.type === "audio" ? "A" : "M"}
                              </span>
                              <p
                                className={`truncate text-sm font-semibold tracking-tight ${isTrackSelected ? "text-cyan-50" : "text-slate-100"}`}
                              >
                                {track.name}
                              </p>
                            </div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {track.type === "audio"
                                ? "Audio track"
                                : "Instrument track"}{" "}
                              #{trackIndex + 1}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-full p-1 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeTrack(track.id);
                            }}
                            aria-label={`Remove ${track.name}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1">
                            {track.type === "midi" && (
                              <button
                                type="button"
                                className={`flex h-6 min-w-8 items-center justify-center rounded-full border px-2 text-[9px] font-bold tracking-[0.18em] transition-all ${track.recordArmed ? "border-rose-400/50 bg-rose-500/20 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.22)]" : "border-white/10 bg-black/20 text-slate-400 hover:text-rose-100"}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleTrackRecordArm(track.id);
                                }}
                                title={
                                  track.recordArmed
                                    ? "Disarm recording"
                                    : "Arm for recording"
                                }
                                aria-pressed={track.recordArmed}
                              >
                                {isRecording && recordingTrackId === track.id
                                  ? "REC"
                                  : "R"}
                              </button>
                            )}
                            <button
                              type="button"
                              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold transition-all ${track.muted ? "border-red-500/40 bg-red-500/20 text-red-200" : "border-white/10 bg-black/20 text-slate-400 hover:text-slate-200"}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateTrack(track.id, { muted: !track.muted });
                              }}
                              title="Mute"
                            >
                              M
                            </button>
                            <button
                              type="button"
                              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold transition-all ${track.solo ? "border-yellow-500/40 bg-yellow-500/20 text-yellow-100" : "border-white/10 bg-black/20 text-slate-400 hover:text-slate-200"}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                updateTrack(track.id, { solo: !track.solo });
                              }}
                              title="Solo"
                            >
                              S
                            </button>
                          </div>

                          <div
                            className="flex flex-1 items-center gap-3"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="w-10 font-mono text-[10px] text-slate-400">
                              {Math.round(track.volume * 100)}%
                            </span>
                            <Slider
                              value={[track.volume]}
                              min={0}
                              max={1}
                              step={0.01}
                              onValueChange={(value) => {
                                updateTrack(track.id, {
                                  volume: value[0] ?? track.volume,
                                });
                              }}
                              aria-label={`${track.name} volume`}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="relative shrink-0"
                      style={{ width: `${canvasWidth}px` }}
                      onClick={handleSeek}
                    >
                      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[linear-gradient(90deg,rgba(8,15,28,0.38),transparent)] opacity-50" />
                      {track.clips.map((clip) => {
                        const isClipSelected = clip.id === selectedClipId;
                        const isAudio = track.type === "audio";
                        const clipNotes = clip.notes;
                        const preview =
                          dragPreview?.trackId === track.id &&
                          dragPreview.clipId === clip.id
                            ? dragPreview
                            : null;
                        const renderedStartTime =
                          preview?.startTime ?? clip.startTime;
                        const renderedDuration =
                          preview?.duration ?? clip.duration;
                        const showGhost = preview !== null;

                        return (
                          <div key={clip.id}>
                            {showGhost && (
                              <div
                                className="pointer-events-none absolute bottom-1 top-1 rounded-xl border border-dashed border-cyan-100/75 bg-cyan-200/12 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                                style={{
                                  left: `${renderedStartTime * zoom}px`,
                                  width: `${Math.max(renderedDuration * zoom, 36)}px`,
                                }}
                              />
                            )}
                            <button
                              type="button"
                              className={`absolute bottom-1 top-1 overflow-hidden rounded-xl border px-0 text-left text-xs shadow-[0_14px_26px_rgba(2,6,23,0.24)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 ${isClipSelected ? "z-10 border-cyan-100 ring-2 ring-cyan-300/45" : "border-black/25 hover:brightness-110"} ${activeTool === "split" ? "cursor-cell" : activeTool === "trim" ? "cursor-col-resize" : "cursor-grab active:cursor-grabbing"} ${showGhost ? "opacity-45" : "opacity-100"}`}
                              style={{
                                left: `${clip.startTime * zoom}px`,
                                width: `${Math.max(clip.duration * zoom, 36)}px`,
                                background: getClipGradient(isAudio),
                              }}
                              onMouseDown={(event) =>
                                handleClipPointerDown(event, track.id, clip)
                              }
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`${track.name} clip ${clip.name}`}
                            >
                              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-white/50" />
                              <div
                                className="pointer-events-none absolute inset-y-0 left-0 w-1"
                                style={{ backgroundColor: trackColor }}
                              />
                              <div className="pointer-events-none absolute inset-y-1 left-0 w-2 rounded-l-xl bg-white/10" />
                              <div className="pointer-events-none absolute inset-y-1 right-0 w-2 rounded-r-xl bg-white/10" />
                              <div className="flex h-full flex-col justify-between">
                                <div className="flex items-start justify-between gap-2 px-2 pt-1.5">
                                  <span className="truncate font-semibold tracking-wide text-white/95">
                                    {clip.name}
                                  </span>
                                  <span className="rounded-full border border-white/15 bg-black/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/80">
                                    {isAudio ? "Audio" : "Midi"}
                                  </span>
                                </div>

                                {isAudio && clip.waveformData ? (
                                  <div className="flex h-7 items-end gap-px px-2 pb-2 opacity-80">
                                    {clip.waveformData
                                      .slice(0, 48)
                                      .map((value, index) => (
                                        <div
                                          key={`${clip.id}-${index}`}
                                          className="w-full rounded-full bg-white/80"
                                          style={{
                                            height: `${Math.max(8, value * 100)}%`,
                                          }}
                                        />
                                      ))}
                                  </div>
                                ) : clipNotes.length > 0 ? (
                                  <div className="relative mx-2 mb-2 h-8 overflow-hidden rounded-md bg-black/10">
                                    {clipNotes.slice(0, 18).map((note) => {
                                      const left =
                                        (note.startTime /
                                          Math.max(clip.duration, 0.01)) *
                                        100;
                                      const width = Math.max(
                                        6,
                                        (note.duration /
                                          Math.max(clip.duration, 0.01)) *
                                          100,
                                      );
                                      const vertical =
                                        100 -
                                        ((note.pitch - 24) / (108 - 24)) * 100;

                                      return (
                                        <span
                                          key={note.id}
                                          className="absolute h-[2px] rounded-full bg-white/80"
                                          style={{
                                            left: `${left}%`,
                                            width: `${Math.min(width, 100 - left)}%`,
                                            top: `${vertical}%`,
                                          }}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="px-2 pb-2 text-[10px] font-medium text-white/78">
                                    {formatTime(clip.duration)}
                                  </div>
                                )}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
