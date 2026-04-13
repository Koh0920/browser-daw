import { useEffect, useRef } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  Square,
  Repeat,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { requestAudioContextUnlock } from "@/audio/audioContextEvents";
import { useTransport } from "@/hooks/useTransport";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import {
  getPlaybackDiagnosticsSnapshot,
  subscribePlaybackDiagnostics,
} from "@/utils/playbackDiagnostics";

interface TransportBarProps {
  duration: number;
  inputLabel: string;
  inputModeLabel: string;
  isRecording: boolean;
  onToggleRecording: () => void;
  recordEnabled: boolean;
  supportMessage?: string | null;
}

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 1000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
};

const formatVolume = (volume: number) => `${Math.round(volume * 100)}%`;
const DISPLAY_UPDATE_INTERVAL_MS = 50;

const TransportBar = ({
  duration,
  inputLabel,
  inputModeLabel,
  isRecording,
  onToggleRecording,
  recordEnabled,
  supportMessage,
}: TransportBarProps) => {
  const currentTimeRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const transportStatsRef = useRef<HTMLSpanElement | null>(null);
  const workerStatsRef = useRef<HTMLSpanElement | null>(null);
  const longTaskStatsRef = useRef<HTMLSpanElement | null>(null);
  const lastDisplayUpdateAtRef = useRef(0);
  const {
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

  useEffect(() => {
    const updatePlaybackDisplay = (time: number) => {
      const now = performance.now();
      if (now - lastDisplayUpdateAtRef.current < DISPLAY_UPDATE_INTERVAL_MS) {
        return;
      }
      lastDisplayUpdateAtRef.current = now;

      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = formatTime(time);
      }

      if (progressFillRef.current) {
        const ratio = Math.min(1, time / Math.max(duration, 0.001));
        progressFillRef.current.style.transform = `scaleX(${ratio})`;
      }
    };

    updatePlaybackDisplay(getTransportCurrentTime());
    return subscribeTransportCurrentTime(updatePlaybackDisplay);
  }, [duration]);

  useEffect(() => {
    const updateDiagnostics = (snapshot = getPlaybackDiagnosticsSnapshot()) => {
      if (transportStatsRef.current) {
        transportStatsRef.current.textContent = `UI ${snapshot.transportFps}fps / jitter ${snapshot.transportJitterMs.toFixed(1)}ms`;
      }

      if (workerStatsRef.current) {
        workerStatsRef.current.textContent = `Worker ${snapshot.workerTickMs.toFixed(0)}ms / jitter ${snapshot.workerJitterMs.toFixed(1)}ms`;
      }

      if (longTaskStatsRef.current) {
        longTaskStatsRef.current.textContent = `Long tasks ${snapshot.longTaskCount} / ${snapshot.longTaskMs.toFixed(0)}ms`;
      }
    };

    updateDiagnostics();
    return subscribePlaybackDiagnostics(updateDiagnostics);
  }, []);

  const initialTime = getTransportCurrentTime();

  return (
    <section
      className="flex h-14 w-full shrink-0 items-center gap-0 px-4 text-slate-300"
      onPointerDownCapture={() => requestAudioContextUnlock()}
      onKeyDownCapture={() => requestAudioContextUnlock()}
    >
      {/* Left: Transport controls */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded text-slate-400 transition hover:bg-white/8 hover:text-cyan-400 active:scale-95"
          onClick={() => rewind()}
          title="Rewind"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded text-slate-400 transition hover:bg-white/8 hover:text-cyan-400 active:scale-95"
          onClick={() => stop()}
          title="Stop"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          className={`flex h-10 w-10 items-center justify-center rounded transition active:scale-95 ${isPlaying ? "bg-cyan-400 text-[#08111d] shadow-[0_0_14px_rgba(34,211,238,0.35)]" : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"}`}
          onClick={() => togglePlayback()}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 ml-0.5 fill-current" />
          )}
        </button>
        <button
          type="button"
          className={`ml-1 flex h-9 min-w-12 items-center justify-center rounded border px-3 text-[10px] font-black uppercase tracking-[0.24em] transition active:scale-95 ${isRecording ? "border-rose-400/40 bg-rose-500/18 text-rose-100" : recordEnabled ? "border-white/8 bg-white/5 text-slate-300 hover:border-rose-500/40 hover:text-rose-100" : "border-white/8 bg-white/5 text-slate-500 opacity-60"}`}
          onClick={onToggleRecording}
          title={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
          disabled={!recordEnabled && !isRecording}
        >
          REC
        </button>
        <div className="mx-2 h-5 w-px bg-slate-800" />
        <button
          type="button"
          className={`flex h-9 w-9 items-center justify-center rounded transition active:scale-95 ${isLoopEnabled ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:bg-white/8 hover:text-cyan-400"}`}
          onClick={() => setLoopEnabled(!isLoopEnabled)}
          title="Toggle Loop"
        >
          <Repeat className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-3 h-5 w-px shrink-0 bg-slate-800" />

      {/* Center: Time + Progress */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          ref={currentTimeRef}
          className="shrink-0 daw-lcd-readout text-lg font-bold tabular-nums leading-none"
        >
          {formatTime(initialTime)}
        </span>
        <div className="group relative h-1.5 flex-1 cursor-default overflow-hidden border border-slate-800 bg-black/35">
          <div
            ref={progressFillRef}
            className="absolute inset-y-0 left-0 bg-cyan-500/70"
            style={{
              width: "100%",
              transform: `scaleX(${Math.min(1, initialTime / Math.max(duration, 0.001))})`,
              transformOrigin: "left center",
            }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
          {formatTime(duration)}
        </span>
      </div>

      {/* Hidden debug refs — preserved for diagnostic subscriptions */}
      <span ref={transportStatsRef} className="hidden" aria-hidden="true" />
      <span ref={workerStatsRef} className="hidden" aria-hidden="true" />
      <span ref={longTaskStatsRef} className="hidden" aria-hidden="true" />

      <div className="mx-3 h-5 w-px shrink-0 bg-slate-800" />

      {/* Loop IN / OUT */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          IN
        </span>
        <input
          type="number"
          min={0}
          max={duration}
          step={0.25}
          value={loopStart}
          onChange={(event) =>
            setLoopPoints(Number(event.target.value), loopEnd)
          }
          className="h-7 w-14 appearance-none border border-slate-800 bg-black/25 px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-slate-700">–</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          OUT
        </span>
        <input
          type="number"
          min={0}
          max={duration}
          step={0.25}
          value={loopEnd}
          onChange={(event) =>
            setLoopPoints(loopStart, Number(event.target.value))
          }
          className="h-7 w-14 appearance-none border border-slate-800 bg-black/25 px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>

      <div className="mx-3 h-5 w-px shrink-0 bg-slate-800" />

      {/* Master Volume */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={`flex h-8 w-8 items-center justify-center rounded transition active:scale-95 ${isMasterMuted || masterVolume === 0 ? "text-rose-300" : "text-slate-400 hover:text-cyan-300"}`}
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
        <div className="flex w-32 flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Master
            </span>
            <span
              className={`font-mono text-[10px] ${isMasterMuted ? "text-rose-300" : "text-cyan-200"}`}
            >
              {isMasterMuted ? "Muted" : formatVolume(masterVolume)}
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(masterVolume * 100)]}
            onPointerDown={() => requestAudioContextUnlock()}
            onValueChange={(value) => {
              requestAudioContextUnlock();
              const nextVolume = (value[0] ?? 0) / 100;
              setMasterVolume(nextVolume);
              setMasterMuted(nextVolume === 0);
            }}
            aria-label="Master volume"
          />
        </div>
      </div>

      <div className="mx-3 h-5 w-px shrink-0 bg-slate-800" />

      {/* Live Input */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Input
        </span>
        <span
          className={`rounded px-2 py-0.5 font-mono text-[10px] ${inputModeLabel === "QWERTY" ? "bg-amber-400/10 text-amber-200" : "bg-cyan-400/10 text-cyan-100"}`}
        >
          {inputModeLabel}
        </span>
        <p className="max-w-[140px] truncate text-xs font-medium text-slate-300">
          {inputLabel}
        </p>
        {supportMessage && (
          <p className="max-w-[160px] truncate text-[10px] text-amber-200/80">
            {supportMessage}
          </p>
        )}
      </div>
    </section>
  );
};

export default TransportBar;
