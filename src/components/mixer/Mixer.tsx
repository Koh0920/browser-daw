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
    <div className={`border-l border-border bg-background transition-all ${isExpanded ? "w-80" : "w-12"}`}>
      <div className="flex items-center justify-between p-2 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-8 w-8">
          {isExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>

        {isExpanded && <div className="text-sm font-medium">Mixer</div>}
      </div>

      {isExpanded ? (
        <div className="p-2 overflow-y-auto h-[calc(100%-44px)]">
          <div className="grid gap-4">
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
