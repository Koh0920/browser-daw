"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Mic, Volume2, ChevronRight, ChevronDown, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useProjectStore } from "@/stores/projectStore"
import type { AudioTrack as AudioTrackType } from "@/types"
import AudioClipView from "./AudioClipView"

interface AudioTrackProps {
  track: AudioTrackType
  readOnly?: boolean
}

const AudioTrack = ({ track, readOnly = false }: AudioTrackProps) => {
  const { updateTrack, removeTrack, selectTrack, selectedTrackId, addAudioClip } = useProjectStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleVolumeChange = (value: number[]) => {
    updateTrack(track.id, { volume: value[0] })
  }

  const handlePanChange = (value: number[]) => {
    updateTrack(track.id, { pan: value[0] })
  }

  const handleMuteToggle = (checked: boolean) => {
    updateTrack(track.id, { muted: checked })
  }

  const handleSoloToggle = (checked: boolean) => {
    updateTrack(track.id, { solo: checked })
  }

  const handleRemoveTrack = () => {
    removeTrack(track.id)
  }

  const handleSelectTrack = () => {
    selectTrack(track.id)
  }

  const handleFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === "audio/wav") {
      try {
        const arrayBuffer = await file.arrayBuffer()
        addAudioClip(track.id, {
          name: file.name,
          startTime: 0,
          audioData: arrayBuffer,
        })
      } catch (error) {
        console.error("Error loading audio file:", error)
      }
    }
  }

  const isSelected = selectedTrackId === track.id

  return (
    <div className={`flex flex-col ${isSelected ? "bg-accent/20" : ""}`} onClick={handleSelectTrack}>
      <div className="flex items-center p-2 gap-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <Mic className="h-5 w-5 text-destructive" />

        <div className="flex-1 text-sm font-medium truncate">{track.name}</div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs">M</span>
            <Switch checked={track.muted} onCheckedChange={handleMuteToggle} disabled={readOnly} />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs">S</span>
            <Switch checked={track.solo} onCheckedChange={handleSoloToggle} disabled={readOnly} />
          </div>

          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider
            value={[track.volume]}
            min={0}
            max={1}
            step={0.01}
            className="w-24"
            onValueChange={handleVolumeChange}
            disabled={readOnly}
          />

          {!readOnly && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleFileUpload}>
                <Upload className="h-4 w-4" />
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept="audio/wav" onChange={handleFileChange} />

              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleRemoveTrack}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="pl-8 pr-2 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">Pan</span>
            <Slider
              value={[track.pan]}
              min={-1}
              max={1}
              step={0.01}
              className="w-24"
              onValueChange={handlePanChange}
              disabled={readOnly}
            />
          </div>

          <AudioClipView track={track} readOnly={readOnly} />
        </div>
      )}
    </div>
  )
}

export default AudioTrack
