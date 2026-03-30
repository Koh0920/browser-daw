"use client";

import type React from "react";

import { useRef, useEffect, useState } from "react";
import { Scissors, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";
import { useTransport } from "@/hooks/useTransport";
import type { AudioTrack, AudioClip } from "@/types";

interface AudioEditorProps {
  track: AudioTrack;
}

const AudioEditor = ({ track }: AudioEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { currentProject, moveAudioClip, splitAudioClip, trimAudioClip } =
    useProjectStore();
  const { currentTime, seekTo } = useTransport();

  const [zoom, setZoom] = useState(100); // pixels per second
  const [selectedClip, setSelectedClip] = useState<AudioClip | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragAction, setDragAction] = useState<
    "move" | "trim-start" | "trim-end" | null
  >(null);

  const duration = currentProject?.duration || 60;
  const canvasWidth = duration * zoom;
  const canvasHeight = 200;

  // Find a clip to edit
  useEffect(() => {
    if (track.clips && track.clips.length > 0) {
      setSelectedClip(track.clips[0]);
    } else {
      setSelectedClip(null);
    }
  }, [track.clips]);

  // Draw audio waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    // Vertical grid lines (1 second intervals)
    for (let i = 0; i <= duration; i++) {
      const x = i * zoom;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Draw audio clips
    if (track.clips && track.clips.length > 0) {
      track.clips.forEach((clip) => {
        const isSelected = selectedClip && selectedClip.id === clip.id;
        drawAudioClip(ctx, clip, isSelected);
      });
    }

    // Draw playhead
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 2;
    const playheadX = currentTime * zoom;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();
  }, [track.clips, selectedClip, currentTime, duration, zoom]);

  const drawAudioClip = (
    ctx: CanvasRenderingContext2D,
    clip: AudioClip,
    isSelected: boolean,
  ) => {
    const x = clip.startTime * zoom;
    const width = clip.duration * zoom;

    // Draw clip background
    ctx.fillStyle = isSelected
      ? "rgba(255, 80, 80, 0.5)"
      : "rgba(255, 80, 80, 0.3)";
    ctx.fillRect(x, 0, width, canvasHeight);

    // Draw clip border
    ctx.strokeStyle = isSelected
      ? "rgba(255, 80, 80, 1)"
      : "rgba(255, 80, 80, 0.8)";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, 0, width, canvasHeight);

    // Draw clip name
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "12px sans-serif";
    ctx.fillText(clip.name, x + 5, 20);

    // Draw waveform if we have audio data
    if (clip.waveformData) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();

      const middle = canvasHeight / 2;
      const waveformLength = clip.waveformData.length;
      const step = Math.max(1, Math.floor(waveformLength / width));

      for (let i = 0; i < waveformLength; i += step) {
        const x1 = x + (i / waveformLength) * width;
        const y1 = middle + (clip.waveformData[i] * canvasHeight) / 2;

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
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
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

    // Check if clicking on an existing clip
    const clickTimePosition = x / zoom;

    if (track.clips) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        if (clickTimePosition >= clipStart && clickTimePosition <= clipEnd) {
          setSelectedClip(clip);

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

          return;
        }
      }
    }

    // If not clicking on a clip, deselect
    setSelectedClip(null);
    setDragAction(null);

    // Set playhead position
    seekTo(clickTimePosition);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart || !selectedClip || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dx = (x - dragStart.x) / zoom;

    if (dragAction === "move") {
      const newStartTime = Math.max(0, selectedClip.startTime + dx);
      moveAudioClip(track.id, selectedClip.id, newStartTime);
    } else if (dragAction === "trim-start") {
      const newStartTime = Math.max(0, selectedClip.startTime + dx);
      const newDuration = Math.max(0.1, selectedClip.duration - dx);
      trimAudioClip(
        track.id,
        selectedClip.id,
        newStartTime,
        newDuration,
        "start",
      );
    } else if (dragAction === "trim-end") {
      const newDuration = Math.max(0.1, selectedClip.duration + dx);
      trimAudioClip(
        track.id,
        selectedClip.id,
        selectedClip.startTime,
        newDuration,
        "end",
      );
    }

    setDragStart({ x, y: dragStart.y });
  };

  const handleMouseUp = () => {
    setDragStart(null);
    setDragAction(null);
  };

  const handleSplitClip = () => {
    if (selectedClip) {
      splitAudioClip(track.id, selectedClip.id, currentTime);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.2, 500));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.2, 50));
  };

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSplitClip}
          disabled={!selectedClip}
        >
          <Scissors className="h-4 w-4 mr-2" />
          Split at Playhead
        </Button>

        <Button variant="outline" size="icon" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button variant="outline" size="icon" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>

        {selectedClip && (
          <div className="text-sm ml-4">Selected: {selectedClip.name}</div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
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
  );
};

export default AudioEditor;
