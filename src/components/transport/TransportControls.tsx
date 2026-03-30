"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Play, Pause, Square, SkipBack, Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useProjectStore } from "@/stores/projectStore"
import { useTransport } from "@/hooks/useTransport"
import { formatTime } from "@/utils/timeFormat"

interface TransportControlsProps {
  readOnly?: boolean
}

const TransportControls = ({ readOnly = false }: TransportControlsProps) => {
  const { currentProject, updateProjectSettings } = useProjectStore()
  const { isPlaying, currentTime, isLooping, loopStart, loopEnd, togglePlay, stop, rewind, setLooping, setLoopPoints } =
    useTransport()

  const [bpm, setBpm] = useState(currentProject?.bpm || 120)

  useEffect(() => {
    if (currentProject) {
      setBpm(currentProject.bpm)
    }
  }, [currentProject])

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = Number.parseInt(e.target.value)
    if (!isNaN(newBpm) && newBpm > 0) {
      setBpm(newBpm)
    }
  }

  const handleBpmBlur = () => {
    if (currentProject && bpm !== currentProject.bpm) {
      updateProjectSettings({ bpm })
    }
  }

  const handleLoopToggle = (checked: boolean) => {
    setLooping(checked)
  }

  return (
    <div className="border-b border-border p-2 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={rewind} disabled={readOnly}>
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button variant={isPlaying ? "default" : "outline"} size="icon" onClick={togglePlay} disabled={readOnly}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <Button variant="outline" size="icon" onClick={stop} disabled={readOnly}>
          <Square className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-sm font-mono">{formatTime(currentTime)}</div>

      <div className="flex items-center gap-2">
        <Label htmlFor="bpm" className="text-sm">
          BPM
        </Label>
        <Input
          id="bpm"
          type="number"
          value={bpm}
          onChange={handleBpmChange}
          onBlur={handleBpmBlur}
          className="w-16 h-8"
          min={1}
          max={999}
          disabled={readOnly}
        />
      </div>

      <div className="flex items-center gap-2">
        <Repeat className={`h-4 w-4 ${isLooping ? "text-primary" : "text-muted-foreground"}`} />
        <Switch checked={isLooping} onCheckedChange={handleLoopToggle} disabled={readOnly} />
      </div>

      {isLooping && (
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">Loop:</div>
          <div className="text-xs font-mono">{formatTime(loopStart)}</div>
          <Slider
            value={[loopStart, loopEnd]}
            min={0}
            max={currentProject?.duration || 60}
            step={0.1}
            onValueChange={(value) => setLoopPoints(value[0], value[1])}
            className="w-32"
            disabled={readOnly}
          />
          <div className="text-xs font-mono">{formatTime(loopEnd)}</div>
        </div>
      )}
    </div>
  )
}

export default TransportControls
