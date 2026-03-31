import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTransport } from "@/hooks/useTransport";
import { useProjectStore } from "@/stores/projectStore";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import { formatTime } from "@/utils/timeFormat";

const TRACK_HEIGHT = 80;
const MIN_ZOOM = 32;
const MAX_ZOOM = 160;
const AUTOSCROLL_INTERVAL_MS = 120;
const AUTOSCROLL_LEAD_RATIO = 0.14;
const AUTOSCROLL_TRAIL_RATIO = 0.08;
const AUTOSCROLL_TARGET_RATIO = 0.28;
const MIN_AUTOSCROLL_DELTA_PX = 72;

const getClipGradient = (isAudio: boolean) =>
  isAudio
    ? "linear-gradient(180deg, rgba(251, 146, 60, 0.96) 0%, rgba(194, 65, 12, 0.88) 100%)"
    : "linear-gradient(180deg, rgba(103, 232, 249, 0.96) 0%, rgba(8, 145, 178, 0.88) 100%)";

export const ArrangementView = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerContentRef = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef = useRef<HTMLDivElement>(null);
  const gridPlayheadRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(56);
  const isPlayingRef = useRef(false);
  const scrollLeftRef = useRef(0);
  const autoScrollTargetRef = useRef<number | null>(null);
  const lastAutoscrollAtRef = useRef(0);
  const [zoom, setZoom] = useState(56);
  const currentProject = useProjectStore((state) => state.currentProject);
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId);
  const selectedClipId = useProjectStore((state) => state.selectedClipId);
  const selectTrack = useProjectStore((state) => state.selectTrack);
  const selectClip = useProjectStore((state) => state.selectClip);
  const { isPlaying, seekTo } = useTransport();

  const duration = currentProject?.duration ?? 60;
  const bpm = currentProject?.bpm ?? 120;
  const beatsPerBar = currentProject?.timeSignatureNumerator ?? 4;
  const beatDuration = 60 / Math.max(bpm, 1);
  const barDuration = beatDuration * beatsPerBar;
  const beatWidth = beatDuration * zoom;
  const barWidth = barDuration * zoom;
  const canvasWidth = Math.max(duration * zoom, 1200);

  const markers = useMemo(() => {
    const nextMarkers = [];

    for (let barIndex = 0; barIndex <= Math.ceil(duration / barDuration); barIndex += 1) {
      const left = barIndex * barWidth;
      nextMarkers.push(
        <div
          key={barIndex}
          className="absolute bottom-0 top-0 border-l border-[hsl(var(--daw-grid-strong)/0.72)]"
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

    if (rulerContentRef.current) {
      rulerContentRef.current.style.transform = `translateX(-${scrollLeftRef.current}px)`;
    }
  }, [zoom]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
      const viewportWidth = scrollElement.clientWidth;
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
          Math.abs(nextScrollLeft - autoScrollTargetRef.current) > MIN_AUTOSCROLL_DELTA_PX
        ) {
          autoScrollTargetRef.current = nextScrollLeft;
        }

        if (Math.abs(scrollElement.scrollLeft - autoScrollTargetRef.current) > MIN_AUTOSCROLL_DELTA_PX) {
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

  const handleSeek = (
    event: React.MouseEvent<HTMLDivElement>,
    includeScrollOffset: boolean,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const timelineX = offsetX + (includeScrollOffset ? scrollLeftRef.current : 0);
    seekTo(Math.max(0, timelineX / zoom));
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollLeft = event.currentTarget.scrollLeft;
    scrollLeftRef.current = nextScrollLeft;

    if (rulerContentRef.current) {
      rulerContentRef.current.style.transform = `translateX(-${nextScrollLeft}px)`;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,hsl(var(--daw-surface-3)),hsl(var(--daw-surface-2)))] text-slate-100">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(38,45,61,0.96),rgba(24,29,41,0.96))] px-3">
        <div className="flex items-center gap-3">
          <h2 className="daw-panel-title text-slate-300">
            Arrangement
          </h2>
          <div className="h-4 w-px bg-white/12" />
          <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-slate-300">
            {beatsPerBar}/{currentProject.timeSignatureDenominator ?? 4} • {bpm} BPM • {formatTime(duration)}
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
        className="relative h-8 shrink-0 overflow-hidden border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(34,40,54,0.98),rgba(27,32,44,0.98))]"
        onClick={(event) => handleSeek(event, true)}
      >
        <div
          ref={rulerContentRef}
          className="absolute top-0 h-full"
          style={{
            width: `${canvasWidth}px`,
            transform: `translateX(-${scrollLeftRef.current}px)`,
          }}
        >
          {markers}
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`,
              backgroundSize: `${beatWidth}px 100%`,
            }}
          />
          <div
            ref={rulerPlayheadRef}
            className="pointer-events-none absolute bottom-0 top-0 left-0 z-20"
            style={{ transform: `translateX(calc(var(--transport-current-time) * ${zoom}px))` }}
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
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        onScroll={handleScroll}
        onClick={(event) => handleSeek(event, true)}
      >
        <div
          className="relative"
          style={{
            width: `${canvasWidth}px`,
            height: `${currentProject.tracks.length * TRACK_HEIGHT}px`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(4,8,15,0.55) 1px, transparent 1px)",
              backgroundSize: `${barWidth}px 100%, ${beatWidth}px 100%, 100% ${TRACK_HEIGHT}px`,
            }}
          />

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.18),transparent_40%)]" />

          {currentProject.tracks.map((track, trackIndex) => {
            const isTrackSelected = track.id === selectedTrackId;
            const trackColor = `hsl(${track.trackColor ?? (track.type === "audio" ? "24 96% 63%" : "190 92% 56%")})`;

            return (
              <div
                key={track.id}
                className={`absolute w-full border-b border-black/20 transition-colors ${isTrackSelected ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.18),rgba(34,211,238,0.06))]" : "bg-transparent hover:bg-white/[0.04]"}`}
                style={{
                  top: `${trackIndex * TRACK_HEIGHT}px`,
                  height: `${TRACK_HEIGHT}px`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  selectTrack(track.id);
                }}
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[linear-gradient(90deg,rgba(8,15,28,0.38),transparent)] opacity-60" />
                <div
                  className="pointer-events-none absolute inset-y-1 left-0 w-1 rounded-r-full"
                  style={{ backgroundColor: trackColor }}
                />

                {track.clips.map((clip) => {
                  const isClipSelected = clip.id === selectedClipId;
                  const isAudio = track.type === "audio";
                  const clipNotes = clip.notes;

                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={`absolute bottom-1 top-1 overflow-hidden rounded-xl border px-0 text-left text-xs shadow-[0_14px_26px_rgba(2,6,23,0.24)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 ${isClipSelected ? "z-10 border-cyan-100 ring-2 ring-cyan-300/45" : "border-black/25 hover:brightness-110"}`}
                      style={{
                        left: `${clip.startTime * zoom}px`,
                        width: `${Math.max(clip.duration * zoom, 36)}px`,
                        background: getClipGradient(isAudio),
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectTrack(track.id);
                        selectClip(clip.id);
                      }}
                      aria-label={`${track.name} clip ${clip.name}`}
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-white/50" />
                      <div className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ backgroundColor: trackColor }} />
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
                              const left = (note.startTime / Math.max(clip.duration, 0.01)) * 100;
                              const width = Math.max(
                                6,
                                (note.duration / Math.max(clip.duration, 0.01)) * 100,
                              );
                              const vertical = 100 - ((note.pitch - 24) / (108 - 24)) * 100;

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
                  );
                })}
              </div>
            );
          })}

          <div
            ref={gridPlayheadRef}
            className="pointer-events-none absolute bottom-0 top-0 left-0 z-30"
            style={{ transform: `translateX(calc(var(--transport-current-time) * ${zoom}px))` }}
          >
            <div className="absolute inset-y-0 -left-2 w-4 bg-[linear-gradient(180deg,rgba(251,113,133,0.18),rgba(251,113,133,0.04))]" />
            <div className="absolute inset-y-0 left-0 w-px bg-[hsl(var(--daw-playhead))] shadow-[0_0_16px_rgba(251,113,133,0.85)]" />
          </div>
        </div>
      </div>
    </div>
  );
};
