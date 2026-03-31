"use client";

import type React from "react";

import { useRef, useEffect, useState } from "react";
import { Scissors, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { useTransport } from "@/hooks/useTransport";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import type { AudioTrack, AudioClip } from "@/types";

interface AudioEditorProps {
  track: AudioTrack;
}

const AUTOSCROLL_INTERVAL_MS = 120;
const AUTOSCROLL_LEAD_RATIO = 0.14;
const AUTOSCROLL_TRAIL_RATIO = 0.08;
const AUTOSCROLL_TARGET_RATIO = 0.28;
const MIN_AUTOSCROLL_DELTA_PX = 72;

const snapToGrid = (time: number, bpm: number, disableSnap: boolean) => {
  if (disableSnap) {
    return Math.max(0, time);
  }

  const beatDuration = 60 / Math.max(bpm, 1);
  const grid = beatDuration / 4;
  return Math.max(0, Math.round(time / grid) * grid);
};

const AudioEditor = ({ track }: AudioEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollTargetRef = useRef<number | null>(null);
  const lastAutoscrollAtRef = useRef(0);
  const rulerPlayheadRef = useRef<HTMLDivElement | null>(null);
  const canvasPlayheadRef = useRef<HTMLDivElement | null>(null);
  const isPlayingRef = useRef(false);

  const {
    currentProject,
    moveAudioClip,
    selectedClipId,
    selectClip,
    splitAudioClip,
    trimAudioClip,
  } = useProjectStore();
  const { isPlaying, seekTo } = useTransport();

  const [zoom, setZoom] = useState(100); // pixels per second
  const [selectedClip, setSelectedClip] = useState<AudioClip | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<{
    clipId: string;
    startTime: number;
    duration: number;
    trimMode?: "start" | "end" | null;
  } | null>(null);
  const [dragAction, setDragAction] = useState<
    "move" | "trim-start" | "trim-end" | null
  >(null);
  const [hoverCursor, setHoverCursor] = useState<"default" | "move" | "trim">("default");

  const duration = currentProject?.duration || 60;
  const bpm = currentProject?.bpm || 120;
  const beatDuration = 60 / Math.max(bpm, 1);
  const beatWidth = beatDuration * zoom;
  const barWidth = beatWidth * (currentProject?.timeSignatureNumerator ?? 4);
  const canvasWidth = duration * zoom;
  const canvasHeight = 220;

  // Find a clip to edit
  useEffect(() => {
    if (track.clips && track.clips.length > 0) {
      const nextClip =
        track.clips.find((clip) => clip.id === selectedClipId) ??
        track.clips[0];
      setSelectedClip(nextClip);
    } else {
      setSelectedClip(null);
    }
  }, [selectedClipId, track.clips]);

  // Draw audio waveform
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.fillStyle = "rgba(12, 16, 24, 0.96)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= canvasWidth / beatWidth; i++) {
      const x = i * beatWidth;
      const isBar = i % (currentProject?.timeSignatureNumerator ?? 4) === 0;
      ctx.strokeStyle = isBar ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = isBar ? 1.25 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.stroke();

    // Draw audio clips
    if (track.clips && track.clips.length > 0) {
      track.clips.forEach((clip) => {
        const isSelected = selectedClip?.id === clip.id;
        const preview = dragPreview?.clipId === clip.id ? dragPreview : null;
        drawAudioClip(ctx, clip, isSelected, preview);
      });
    }
  }, [barWidth, beatWidth, canvasWidth, currentProject?.timeSignatureNumerator, dragPreview, duration, selectedClip, track.clips, zoom]);

  useEffect(() => {
    const updatePlayhead = (time: number) => {
      const playheadX = time * zoom;

      const scrollElement = scrollRef.current;
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

      const viewportStart = scrollElement.scrollLeft;
      const viewportWidth = scrollElement.clientWidth;
      const safeStart = viewportStart + viewportWidth * AUTOSCROLL_TRAIL_RATIO;
      const safeEnd =
        viewportStart + viewportWidth * (1 - AUTOSCROLL_LEAD_RATIO);

      if (playheadX < safeStart || playheadX > safeEnd) {
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
  }, [zoom]);

  const drawAudioClip = (
    ctx: CanvasRenderingContext2D,
    clip: AudioClip,
    isSelected: boolean,
    preview?: {
      clipId: string;
      startTime: number;
      duration: number;
      trimMode?: "start" | "end" | null;
    } | null,
  ) => {
    const renderedStart = preview?.startTime ?? clip.startTime;
    const renderedDuration = preview?.duration ?? clip.duration;
    const x = renderedStart * zoom;
    const width = renderedDuration * zoom;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, "rgba(251, 146, 60, 0.96)");
    gradient.addColorStop(1, "rgba(194, 65, 12, 0.82)");

    // Draw clip background
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, width, canvasHeight);

    ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
    ctx.fillRect(x, 0, width, 2);

    // Draw clip border
    ctx.strokeStyle = isSelected
      ? "rgba(255, 244, 240, 0.95)"
      : "rgba(124, 45, 18, 0.95)";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, 0, width, canvasHeight);

    if (preview) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.strokeRect(x, 4, width, canvasHeight - 8);
      ctx.restore();
    }

    // Draw clip name
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "600 12px var(--font-body)";
    ctx.fillText(clip.name, x + 5, 20);

    // Draw waveform if we have audio data
    if (clip.waveformData) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();

      const middle = canvasHeight / 2;
      const waveformLength = clip.waveformData.length;
      const step = Math.max(1, Math.floor(waveformLength / width));

      for (let i = 0; i < waveformLength; i += step) {
        const x1 = x + (i / waveformLength) * width;
        const y1 = middle + (clip.waveformData[i] * canvasHeight) / 2.6;

        if (i === 0) {
          ctx.moveTo(x1, y1);
        } else {
          ctx.lineTo(x1, y1);
        }
      }

      ctx.stroke();
    }

    // Draw trim handles if selected
    if (isSelected) {
      // Left handle
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(x, 0, 5, canvasHeight);

      // Right handle
      ctx.fillRect(x + width - 5, 0, 5, canvasHeight);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragStart({ x, y });
    setDragPreview(null);

    // Check if clicking on an existing clip
    const clickTimePosition = x / zoom;

    if (track.clips) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        if (clickTimePosition >= clipStart && clickTimePosition <= clipEnd) {
          setSelectedClip(clip);
          selectClip(clip.id);

          // Check if clicking near the edges (for trimming)
          const clipStartX = clipStart * zoom;
          const clipEndX = clipEnd * zoom;

          if (Math.abs(x - clipStartX) < 10) {
            setDragAction("trim-start");
          } else if (Math.abs(x - clipEndX) < 10) {
            setDragAction("trim-end");
          } else {
            setDragAction("move");
          }

          setDragPreview({
            clipId: clip.id,
            startTime: clip.startTime,
            duration: clip.duration,
            trimMode: null,
          });

          return;
        }
      }
    }

    // If not clicking on a clip, deselect
    setSelectedClip(null);
    selectClip(null);
    setDragAction(null);

    // Set playhead position
    seekTo(clickTimePosition);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTimePosition = x / zoom;

    if (!dragStart || !selectedClip) {
      const hoveredClip = track.clips?.find((clip) => {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        return clickTimePosition >= clipStart && clickTimePosition <= clipEnd;
      });

      if (!hoveredClip) {
        setHoverCursor("default");
        return;
      }

      const clipStartX = hoveredClip.startTime * zoom;
      const clipEndX = (hoveredClip.startTime + hoveredClip.duration) * zoom;
      if (Math.abs(x - clipStartX) < 10 || Math.abs(x - clipEndX) < 10) {
        setHoverCursor("trim");
      } else {
        setHoverCursor("move");
      }
      return;
    }

    const dx = (x - dragStart.x) / zoom;
    const disableSnap = e.altKey;

    if (dragAction === "move") {
      const newStartTime = snapToGrid(
        Math.max(0, selectedClip.startTime + dx),
        bpm,
        disableSnap,
      );
      setDragPreview({
        clipId: selectedClip.id,
        startTime: newStartTime,
        duration: selectedClip.duration,
        trimMode: null,
      });
    } else if (dragAction === "trim-start") {
      const newStartTime = snapToGrid(
        Math.max(0, selectedClip.startTime + dx),
        bpm,
        disableSnap,
      );
      const newDuration = Math.max(
        0.1,
        selectedClip.duration - (newStartTime - selectedClip.startTime),
      );
      setDragPreview({
        clipId: selectedClip.id,
        startTime: newStartTime,
        duration: newDuration,
        trimMode: "start",
      });
    } else if (dragAction === "trim-end") {
      const rawEnd = selectedClip.startTime + selectedClip.duration + dx;
      const snappedEnd = snapToGrid(rawEnd, bpm, disableSnap);
      const newDuration = Math.max(0.1, snappedEnd - selectedClip.startTime);
      setDragPreview({
        clipId: selectedClip.id,
        startTime: selectedClip.startTime,
        duration: newDuration,
        trimMode: "end",
      });
    }
  };

  const handleMouseUp = () => {
    if (selectedClip && dragPreview && dragAction) {
      if (dragAction === "move") {
        moveAudioClip(track.id, selectedClip.id, dragPreview.startTime);
      } else if (dragAction === "trim-start") {
        trimAudioClip(
          track.id,
          selectedClip.id,
          dragPreview.startTime,
          dragPreview.duration,
          "start",
        );
      } else if (dragAction === "trim-end") {
        trimAudioClip(
          track.id,
          selectedClip.id,
          selectedClip.startTime,
          dragPreview.duration,
          "end",
        );
      }
    }

    setDragStart(null);
    setDragAction(null);
    setDragPreview(null);
  };

  const handleSplitClip = () => {
    if (selectedClip) {
      splitAudioClip(track.id, selectedClip.id, getTransportCurrentTime());
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.2, 500));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.2, 50));
  };

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,hsl(var(--daw-surface-3)),hsl(var(--daw-surface-2)))]" ref={containerRef}>
      <div className="flex items-center gap-2 border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(37,42,54,0.96),rgba(26,30,40,0.96))] p-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSplitClip}
          disabled={!selectedClip}
          className="rounded-xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          <Scissors className="h-4 w-4 mr-2" />
          Split at Playhead
        </Button>

        <Button variant="outline" size="icon" onClick={handleZoomIn} className="rounded-xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button variant="outline" size="icon" onClick={handleZoomOut} className="rounded-xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
          <ZoomOut className="h-4 w-4" />
        </Button>

        {selectedClip && (
          <div className="ml-4 rounded-full bg-white/5 px-3 py-1 font-mono text-[11px] text-slate-200">
            Selected: {selectedClip.name}
          </div>
        )}
        <div className="ml-auto rounded-full bg-white/5 px-3 py-1 font-mono text-[11px] text-slate-300">
          Hold ALT to bypass snap
        </div>
      </div>

      <div className="border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(42,48,60,0.96),rgba(32,36,48,0.96))] px-3 py-1.5">
        <div className="relative h-6 overflow-hidden rounded-lg bg-black/20">
          {Array.from({ length: Math.ceil(canvasWidth / beatWidth) + 1 }).map((_, index) => {
            const x = index * beatWidth;
            const isBar = index % (currentProject?.timeSignatureNumerator ?? 4) === 0;
            return (
              <div
                key={`audio-ruler-${index}`}
                className={`absolute bottom-0 top-0 border-l ${isBar ? "border-white/25" : "border-white/8"}`}
                style={{ left: x }}
              >
                {isBar && (
                  <span className="absolute left-1.5 top-0.5 font-mono text-[10px] text-slate-300">
                    {index / (currentProject?.timeSignatureNumerator ?? 4) + 1}
                  </span>
                )}
              </div>
            );
          })}
          <div
            ref={rulerPlayheadRef}
            className="pointer-events-none absolute inset-y-0 z-10 transform-gpu will-change-transform"
            style={{ transform: `translateX(calc(var(--transport-current-time) * ${zoom}px))` }}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[hsl(var(--daw-playhead))] shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div ref={scrollRef} className="relative h-full overflow-auto">
          <div
            className="relative"
            style={{ width: canvasWidth, height: canvasHeight }}
          >
            <div
              ref={canvasPlayheadRef}
              className="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2 transform-gpu will-change-transform"
              style={{ transform: `translateX(calc(var(--transport-current-time) * ${zoom}px))` }}
            >
              <div className="absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 bg-[linear-gradient(180deg,rgba(248,113,113,0.18),rgba(248,113,113,0.04))]" />
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.75)]" />
            </div>
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className={`relative z-0 ${hoverCursor === "trim" ? "cursor-col-resize" : hoverCursor === "move" ? "cursor-grab" : "cursor-pointer"}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioEditor;
