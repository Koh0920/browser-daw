"use client"

import type React from "react"

import { useRef, useEffect, useState } from "react"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport } from "@/hooks/useTransport"
import { formatTime } from "@/utils/timeFormat"

const Timeline = () => {
  const timelineRef = useRef<HTMLDivElement>(null)
  const { currentProject } = useProjectStore()
  const { currentTime, seekTo } = useTransport()
  const [zoom, setZoom] = useState(100) // pixels per second

  const duration = currentProject?.duration || 60 // Default 60 seconds if no project
  const timelineWidth = duration * zoom

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        setZoom((prev) => Math.min(prev + 10, 200))
      } else if (e.key === "-") {
        setZoom((prev) => Math.max(prev - 10, 50))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickTime = clickX / zoom
      seekTo(clickTime)
    }
  }

  // Generate time markers
  const markers = []
  const markerInterval = zoom >= 100 ? 1 : 5 // Adjust marker density based on zoom

  for (let i = 0; i <= duration; i += markerInterval) {
    markers.push(
      <div
        key={i}
        className="absolute top-0 bottom-0 border-l border-border flex flex-col items-center"
        style={{ left: `${i * zoom}px` }}
      >
        <div className="text-xs text-muted-foreground mt-1">{formatTime(i)}</div>
      </div>,
    )
  }

  return (
    <div className="relative border-b border-border h-8 overflow-hidden">
      <div
        ref={timelineRef}
        className="absolute top-0 bottom-0 h-full cursor-pointer"
        style={{ width: `${timelineWidth}px` }}
        onClick={handleTimelineClick}
      >
        {markers}

        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-px bg-primary z-10" style={{ left: `${currentTime * zoom}px` }} />
      </div>
    </div>
  )
}

export default Timeline
