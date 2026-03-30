"use client"

import { Volume2, Music, Mic } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useProjectStore } from "@/stores/projectStore"
import type { ProjectTrack } from "@/types"

interface MixerChannelProps {
  track: ProjectTrack
}

const MixerChannel = ({ track }: MixerChannelProps) => {
  const { updateTrack } = useProjectStore()

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

  return (
    <div className="flex flex-col items-center gap-2 p-2 border border-border rounded-md">
      <div className="flex items-center justify-center w-full">
        {track.kind === "midi" ? (
          <Music className="h-5 w-5 text-primary" />
        ) : (
          <Mic className="h-5 w-5 text-destructive" />
        )}
      </div>

      <div className="text-sm font-medium truncate w-full text-center">{track.name}</div>

      <div className="flex flex-col items-center gap-1 w-full">
        <Slider
          orientation="vertical"
          value={[track.volume]}
          min={0}
          max={1}
          step={0.01}
          className="h-32"
          onValueChange={handleVolumeChange}
        />
        <Volume2 className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex flex-col items-center gap-1 w-full">
        <span className="text-xs">Pan</span>
        <Slider value={[track.pan]} min={-1} max={1} step={0.01} className="w-full" onValueChange={handlePanChange} />
      </div>

      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1">
          <span className="text-xs">M</span>
          <Switch checked={track.muted} onCheckedChange={handleMuteToggle} />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs">S</span>
          <Switch checked={track.solo} onCheckedChange={handleSoloToggle} />
        </div>
      </div>
    </div>
  )
}

export default MixerChannel
