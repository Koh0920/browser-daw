"use client"

import { useState } from "react"
import { Music, Volume2, ChevronRight, ChevronDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useProjectStore } from "@/stores/projectStore"
import type { MidiTrack as MidiTrackType } from "@/types"
import MidiClipView from "./MidiClipView"

interface MidiTrackProps {
  track: MidiTrackType
  readOnly?: boolean
}

const MidiTrack = ({ track, readOnly = false }: MidiTrackProps) => {
  const { updateTrack, removeTrack, selectTrack, selectedTrackId } = useProjectStore()
  const [isExpanded, setIsExpanded] = useState(false)

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

  const isSelected = selectedTrackId === track.id

  return (
    <div className={`flex flex-col ${isSelected ? "bg-accent/20" : ""}`} onClick={handleSelectTrack}>
      <div className="flex items-center p-2 gap-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <Music className="h-5 w-5 text-primary" />

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
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleRemoveTrack}>
              <Trash2 className="h-4 w-4" />
            </Button>
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

          <MidiClipView track={track} readOnly={readOnly} />
        </div>
      )}
    </div>
  )
}

export default MidiTrack
