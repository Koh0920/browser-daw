import { Pause, Play, RotateCcw, Square, Repeat } from "lucide-react"
import { useTransport } from "@/hooks/useTransport"

interface TransportBarProps {
  duration: number
}

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  const milliseconds = Math.floor((time % 1) * 1000)
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`
}

const TransportBar = ({ duration }: TransportBarProps) => {
  const { currentTime, isLoopEnabled, isPlaying, loopEnd, loopStart, rewind, setLoopEnabled, setLoopPoints, stop, togglePlayback } = useTransport()

  return (
    <section className="flex h-14 w-full items-center gap-6 text-slate-300">
      <div className="flex items-center shrink-0 gap-1.5">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800/60 bg-slate-900/50 text-slate-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-95"
          onClick={() => rewind()}
          title="Rewind"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800/60 bg-slate-900/50 text-slate-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-95"
          onClick={() => stop()}
          title="Stop"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 ${isPlaying ? "bg-cyan-500 text-[#0F1423] shadow-[0_0_15px_rgba(34,211,238,0.4)]" : "bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25"}`}
          onClick={() => togglePlayback()}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 ml-0.5 fill-current" />}
        </button>
        <div className="mx-1 h-6 w-px bg-slate-800" />
        <button
          type="button"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-all active:scale-95 ${isLoopEnabled ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "border border-slate-800/60 bg-slate-900/50 text-slate-400 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"}`}
          onClick={() => setLoopEnabled(!isLoopEnabled)}
          title="Toggle Loop"
        >
          <Repeat className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] font-medium tracking-wider text-slate-400">
          <span className="text-cyan-100">{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="group relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-slate-800/80">
          <div
            className="absolute inset-y-0 left-0 bg-cyan-400 transition-[width] duration-75 ease-linear group-hover:bg-cyan-300"
            style={{ width: `${Math.min(100, (currentTime / Math.max(duration, 0.001)) * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-1.5 max-w-sm">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Loop</label>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-slate-600">IN</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.25}
              value={loopStart}
              onChange={(event) => setLoopPoints(Number(event.target.value), loopEnd)}
              className="h-6 w-16 rounded border border-slate-700/50 bg-[#0B0F19] px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>
          <span className="text-slate-700">-</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-slate-600">OUT</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.25}
              value={loopEnd}
              onChange={(event) => setLoopPoints(loopStart, Number(event.target.value))}
              className="h-6 w-16 rounded border border-slate-700/50 bg-[#0B0F19] px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default TransportBar