"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectStore } from "@/stores/projectStore"
import MixerChannel from "./MixerChannel"

const Mixer = () => {
  const { currentProject } = useProjectStore()
  const [isExpanded, setIsExpanded] = useState(false)

  if (!currentProject || !currentProject.tracks || currentProject.tracks.length === 0) {
    return null
  }

  return (
    <div className={`border-l border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,hsl(var(--daw-surface-2)),hsl(var(--daw-surface-1)))] transition-all ${isExpanded ? "w-80" : "w-12"}`}>
      <div className="flex items-center justify-between border-b border-[hsl(var(--daw-panel-border))] p-2">
        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-8 w-8 rounded-xl text-slate-300 hover:bg-white/5 hover:text-cyan-200">
          {isExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>

        {isExpanded && <div className="daw-panel-title text-slate-300">Mixer</div>}
      </div>

      {isExpanded ? (
        <div className="h-[calc(100%-44px)] overflow-y-auto p-3">
          <div className="grid gap-3">
            {currentProject.tracks.map((track) => (
              <MixerChannel key={track.id} track={track} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Mixer
