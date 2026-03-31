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
      className="flex min-h-[72px] w-full items-center gap-5 px-4 py-3 text-slate-300"
      onPointerDownCapture={() => requestAudioContextUnlock()}
      onKeyDownCapture={() => requestAudioContextUnlock()}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-slate-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-95"
          onClick={() => rewind()}
          title="Rewind"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-slate-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-95"
          onClick={() => stop()}
          title="Stop"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${isPlaying ? "bg-cyan-400 text-[#08111d] shadow-[0_0_18px_rgba(34,211,238,0.4)]" : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"}`}
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
          className={`ml-1 flex h-10 min-w-14 items-center justify-center rounded-2xl border px-3 text-[10px] font-black uppercase tracking-[0.24em] transition-all active:scale-95 ${isRecording ? "border-rose-400/40 bg-rose-500/18 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.28)]" : recordEnabled ? "border-white/8 bg-white/5 text-slate-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-100" : "border-white/8 bg-white/5 text-slate-500 opacity-60"}`}
          onClick={onToggleRecording}
          title={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
          disabled={!recordEnabled && !isRecording}
        >
          REC
        </button>
        <div className="mx-1 h-6 w-px bg-slate-800" />
        <button
          type="button"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all active:scale-95 ${isLoopEnabled ? "border border-cyan-500/30 bg-cyan-500/20 text-cyan-200" : "border border-white/8 bg-white/5 text-slate-400 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"}`}
          onClick={() => setLoopEnabled(!isLoopEnabled)}
          title="Toggle Loop"
        >
          <Repeat className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center rounded-[24px] border border-white/8 bg-black/18 px-4 py-3">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] font-medium tracking-[0.12em] text-slate-400">
          <span ref={currentTimeRef} className="text-cyan-100">
            {formatTime(initialTime)}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="group relative h-2 w-full cursor-pointer overflow-hidden rounded-full border border-white/6 bg-black/35">
          <div
            ref={progressFillRef}
            className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.95),rgba(103,232,249,0.7))] group-hover:bg-cyan-300"
            style={{
              width: "100%",
              transform: `scaleX(${Math.min(1, initialTime / Math.max(duration, 0.001))})`,
              transformOrigin: "left center",
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-slate-500">
          <span ref={transportStatsRef}>UI 0fps / jitter 0.0ms</span>
          <span ref={workerStatsRef}>Worker 0ms / jitter 0.0ms</span>
          <span ref={longTaskStatsRef}>Long tasks 0 / 0ms</span>
          <span className={isRecording ? "text-rose-300" : "text-slate-500"}>
            {isRecording ? "Recording live MIDI" : "Record ready"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,35,0.76),rgba(10,15,25,0.96))] px-3 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.18)]">
        <button
          type="button"
          className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all active:scale-95 ${isMasterMuted || masterVolume === 0 ? "border-rose-500/30 bg-rose-500/15 text-rose-300" : "border-white/10 bg-black/25 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"}`}
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

        <div className="flex min-w-40 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Master
            </span>
            <span
              className={`font-mono text-[11px] font-semibold ${isMasterMuted ? "text-rose-300" : "text-cyan-100"}`}
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
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-black/35 accent-cyan-400"
            aria-label="Master volume"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 rounded-[24px] border border-white/8 bg-black/18 px-4 py-3 max-w-sm">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
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
              className="h-8 w-16 rounded-xl border border-white/8 bg-black/25 px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
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
              className="h-8 w-16 rounded-xl border border-white/8 bg-black/25 px-2 font-mono text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>
        </div>
      </div>

      <div className="flex min-w-[240px] shrink-0 flex-col gap-2 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,16,22,0.82),rgba(10,13,22,0.96))] px-4 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.18)]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Live Input
          </span>
          <span
            className={`rounded-full px-2 py-1 font-mono text-[10px] ${inputModeLabel === "QWERTY" ? "bg-amber-400/10 text-amber-200" : "bg-cyan-400/10 text-cyan-100"}`}
          >
            {inputModeLabel}
          </span>
        </div>
        <p className="truncate text-sm font-semibold text-slate-100">
          {inputLabel}
        </p>
        <p
          className={`min-h-[1.25rem] text-[11px] ${supportMessage ? "text-amber-200/90" : "text-slate-500"}`}
        >
          {supportMessage ?? "Realtime monitoring and MIDI capture are ready."}
        </p>
      </div>
    </section>
  );
};

export default TransportBar;
