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
  const trackColor = `hsl(${track.trackColor ?? (track.type === "audio" ? "24 96% 63%" : "190 92% 56%")})`

  const handleVolumeChange = (value: number[]) => {
    updateTrack(track.id, { volume: value[0] ?? track.volume })
  }

  const handlePanChange = (value: number[]) => {
    updateTrack(track.id, { pan: value[0] ?? track.pan })
  }

  const handleMuteToggle = (checked: boolean) => {
    updateTrack(track.id, { muted: checked })
  }

  const handleSoloToggle = (checked: boolean) => {
    updateTrack(track.id, { solo: checked })
  }

  return (
    <div className="relative flex flex-col items-center gap-3 rounded-[24px] border border-white/8 bg-black/18 p-3 text-slate-100 shadow-[0_14px_26px_rgba(0,0,0,0.18)]">
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-[24px]" style={{ backgroundColor: trackColor }} />

      <div className="flex w-full items-center justify-center">
        {track.type === "midi" ? (
          <Music className="h-5 w-5" style={{ color: trackColor }} />
        ) : (
          <Mic className="h-5 w-5" style={{ color: trackColor }} />
        )}
      </div>

      <div className="w-full text-center">
        <div className="truncate text-sm font-semibold">{track.name}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {track.type === "audio" ? "Audio" : "Instrument"}
        </div>
      </div>

      <div className="flex h-8 w-full items-end gap-1 rounded-2xl border border-white/8 bg-white/5 px-2 py-1">
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="w-full rounded-full bg-[linear-gradient(180deg,rgba(34,211,238,0.85),rgba(34,211,238,0.18))]"
            style={{ height: `${20 + ((index * 13) % 80)}%`, opacity: index > 8 ? 0.85 : 0.45 }}
          />
        ))}
      </div>

      <div className="flex w-full flex-col items-center gap-1 rounded-[22px] border border-white/8 bg-white/5 p-3">
        <Slider
          orientation="vertical"
          value={[track.volume]}
          min={0}
          max={1}
          step={0.01}
          className="h-36"
          onValueChange={handleVolumeChange}
        />
        <Volume2 className="h-4 w-4 text-slate-400" />
        <span className="font-mono text-[11px] text-cyan-100">{Math.round(track.volume * 100)}%</span>
      </div>

      <div className="flex w-full flex-col items-center gap-2 rounded-[22px] border border-white/8 bg-white/5 px-3 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pan</span>
        <Slider value={[track.pan]} min={-1} max={1} step={0.01} className="w-full" onValueChange={handlePanChange} />
        <span className="font-mono text-[11px] text-slate-200">{track.pan === 0 ? "C" : track.pan > 0 ? `R ${Math.round(track.pan * 100)}` : `L ${Math.round(Math.abs(track.pan) * 100)}`}</span>
      </div>

      <div className="flex w-full items-center justify-between rounded-[22px] border border-white/8 bg-white/5 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">M</span>
          <Switch checked={track.muted} onCheckedChange={handleMuteToggle} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">S</span>
          <Switch checked={track.solo} onCheckedChange={handleSoloToggle} />
        </div>
      </div>
    </div>
  )
}

export default MixerChannel
