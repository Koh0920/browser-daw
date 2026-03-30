import {
  Pause,
  Play,
  RotateCcw,
  Square,
  Repeat,
  Volume2,
  VolumeX,
} from "lucide-react";
import { requestAudioContextUnlock } from "@/audio/audioContextEvents";
import { useTransport } from "@/hooks/useTransport";

interface TransportBarProps {
  duration: number;
}

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 1000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
};

const formatVolume = (volume: number) => `${Math.round(volume * 100)}%`;

const TransportBar = ({ duration }: TransportBarProps) => {
  const {
    currentTime,
    isLoopEnabled,
    isMasterMuted,
    isPlaying,
    loopEnd,
    loopStart,
    masterVolume,
    rewind,
    setLoopEnabled,
    setLoopPoints,
    setMasterMuted,
    setMasterVolume,
    stop,
    toggleMasterMute,
    togglePlayback,
  } = useTransport();

  return (
    <section
      className="flex h-14 w-full items-center gap-6 text-slate-300"
      onPointerDownCapture={() => requestAudioContextUnlock()}
      onKeyDownCapture={() => requestAudioContextUnlock()}
    >
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
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 ml-0.5 fill-current" />
          )}
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
            style={{
              width: `${Math.min(100, (currentTime / Math.max(duration, 0.001)) * 100)}%`,
            }}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-800/60 bg-[linear-gradient(180deg,rgba(15,23,35,0.76),rgba(10,15,25,0.96))] px-3 py-2 shadow-[0_12px_30px_rgba(2,6,23,0.18)]">
        <button
          type="button"
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-95 ${isMasterMuted || masterVolume === 0 ? "border-rose-500/30 bg-rose-500/15 text-rose-300" : "border-slate-700/70 bg-slate-900/80 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"}`}
          onClick={() => {
            requestAudioContextUnlock();
            toggleMasterMute();
          }}
          title={isMasterMuted ? "Unmute master" : "Mute master"}
          aria-label={isMasterMuted ? "Unmute master" : "Mute master"}
        >
          {isMasterMuted || masterVolume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>

        <div className="flex min-w-36 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Master
            </span>
            <span
              className={`text-[11px] font-semibold ${isMasterMuted ? "text-rose-300" : "text-cyan-100"}`}
            >
              {isMasterMuted ? "Muted" : formatVolume(masterVolume)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(masterVolume * 100)}
            onPointerDown={() => requestAudioContextUnlock()}
            onChange={(event) => {
              requestAudioContextUnlock();
              const nextVolume = Number(event.target.value) / 100;
              setMasterVolume(nextVolume);
              setMasterMuted(nextVolume === 0 ? true : false);
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
            aria-label="Master volume"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-1.5 max-w-sm">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Loop
        </label>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-slate-600">IN</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.25}
              value={loopStart}
              onChange={(event) =>
                setLoopPoints(Number(event.target.value), loopEnd)
              }
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
              onChange={(event) =>
                setLoopPoints(loopStart, Number(event.target.value))
              }
              className="h-6 w-16 rounded border border-slate-700/50 bg-[#0B0F19] px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TransportBar;
