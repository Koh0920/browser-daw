"use client"

import { useState, useEffect } from "react"
import { useProjectStore } from "@/stores/projectStore"
import PianoRoll from "./PianoRoll"
import AudioEditor from "./AudioEditor"

const Editor = () => {
  const { selectedTrackId, currentProject } = useProjectStore()
  const [editorHeight, setEditorHeight] = useState(300)
  const [isDragging, setIsDragging] = useState(false)

  const selectedTrack = currentProject?.tracks.find((track) => track.id === selectedTrackId)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newHeight = window.innerHeight - e.clientY
        setEditorHeight(Math.max(100, Math.min(600, newHeight)))
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  if (!selectedTrack) {
    return null
  }

  return (
    <div className="border-t border-border bg-background" style={{ height: `${editorHeight}px` }}>
      <div className="h-1 bg-border cursor-ns-resize" onMouseDown={() => setIsDragging(true)} />

      <div className="h-full overflow-auto">
        {selectedTrack.type === "midi" ? <PianoRoll track={selectedTrack} /> : <AudioEditor track={selectedTrack} />}
      </div>
    </div>
  )
}

export default Editor
