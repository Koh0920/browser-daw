import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileUp, Plus, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AudioEditor from "@/components/editor/AudioEditor";
import { ArrangementView } from "@/components/editor/ArrangementView";
import MidiPianoRoll from "@/components/editor/MidiPianoRoll";
import { INSTRUMENTS, getInstrumentDefinition } from "@/audio/instruments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import TransportBar from "@/components/transport/TransportBar";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useAudioExport } from "@/hooks/useAudioExport";
import { useProjectDatabase } from "@/hooks/useProjectDatabase";
import { useTransport } from "@/hooks/useTransport";
import { useProjectStore } from "@/stores/projectStore";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import type { AafImportDebugHint } from "@/types";

type ExportTarget = "master" | "stems" | "dawproject";
type ToolMode = "pointer" | "pencil" | "trim";

const GRID_OPTIONS = ["1/4", "1/8", "1/16", "1/32"];
const TOOL_OPTIONS: Array<{ id: ToolMode; label: string; hint: string }> = [
  { id: "pointer", label: "Arrow", hint: "Select and move" },
  { id: "pencil", label: "Draw", hint: "Create notes and clips" },
  { id: "trim", label: "Trim", hint: "Trim clip edges" },
];
const LCD_UPDATE_INTERVAL_MS = 80;

const formatPanLabel = (pan: number) => {
  if (pan > 0) {
    return `R ${Math.round(pan * 100)}`;
  }

  if (pan < 0) {
    return `L ${Math.round(Math.abs(pan) * 100)}`;
  }

  return "C";
};

const formatClock = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const centiseconds = Math.floor((time % 1) * 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
};

const formatBarsBeats = (time: number, bpm: number, beatsPerBar: number) => {
  const safeBpm = Math.max(bpm, 1);
  const beatDuration = 60 / safeBpm;
  const totalBeats = time / beatDuration;
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = Math.floor(totalBeats % beatsPerBar) + 1;
  const sixteenth = Math.floor(((totalBeats % 1) * 4) % 4) + 1;
  return `${bar}.${beat}.${sixteenth}`;
};

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const midiFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const lcdBarsBeatsRef = useRef<HTMLParagraphElement | null>(null);
  const lcdClockRef = useRef<HTMLParagraphElement | null>(null);
  const lastLcdUpdateAtRef = useRef(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>("master");
  const [useLoopRangeForExport, setUseLoopRangeForExport] = useState(false);
  const [exportLoopStart, setExportLoopStart] = useState(0);
  const [exportLoopEnd, setExportLoopEnd] = useState(8);
  const [activeTool, setActiveTool] = useState<ToolMode>("pointer");
  const [gridDivision, setGridDivision] = useState("1/16");
  const {
    addAudioClip,
    addAudioTrack,
    addMidiTrack,
    currentProject,
    currentProjectId,
    importMidiFile,
    loadProject,
    markSaved,
    removeTrack,
    selectClip,
    selectTrack,
    selectedClipId,
    selectedTrackId,
  } = useProjectStore();
  const { getProject, saveProject } = useProjectDatabase();
  const { exportProjectToStems, exportProjectToWav } = useAudioExport();
  const { isLoopEnabled, isPlaying, loopEnd, loopStart } = useTransport();
  useAudioEngine();

  useEffect(() => {
    setExportLoopStart(loopStart);
    setExportLoopEnd(loopEnd);
    setUseLoopRangeForExport(isLoopEnabled);
  }, [isLoopEnabled, loopEnd, loopStart]);

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    if (currentProject && currentProjectId === id) {
      return;
    }

    const loadProjectData = async () => {
      const project = await getProject(id);
      if (project) {
        loadProject(project);
      } else {
        setStatusMessage(
          "Project not found. Return home and create a new one.",
        );
      }
    };

    void loadProjectData();
  }, [currentProject, currentProjectId, getProject, id, loadProject, navigate]);

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const selectedTrack = useMemo(() => {
    return (
      currentProject?.tracks.find((track) => track.id === selectedTrackId) ??
      currentProject?.tracks[0] ??
      null
    );
  }, [currentProject, selectedTrackId]);

  const selectedClip =
    selectedTrack?.clips.find((clip) => clip.id === selectedClipId) ??
    selectedTrack?.clips[0] ??
    null;

  const aafImportMetadata =
    currentProject?.importMetadata?.sourceFormat === "aaf"
      ? currentProject.importMetadata
      : null;
  const beatsPerBar = currentProject?.timeSignatureNumerator ?? 4;
  const beatUnit = currentProject?.timeSignatureDenominator ?? 4;

  const selectedAafHint = useMemo<AafImportDebugHint | null>(() => {
    if (!aafImportMetadata?.aafHints?.length || !selectedTrack) {
      return null;
    }

    const audioFileName = selectedClip?.audioFileName;

    return (
      aafImportMetadata.aafHints.find(
        (hint) =>
          Boolean(audioFileName) &&
          hint.matchedAudioEntryName === audioFileName,
      ) ??
      aafImportMetadata.aafHints.find(
        (hint) => hint.trackName === selectedTrack.name,
      ) ??
      null
    );
  }, [aafImportMetadata, selectedClip?.audioFileName, selectedTrack]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    const updateDisplay = (time: number) => {
      const now = performance.now();
      if (now - lastLcdUpdateAtRef.current < LCD_UPDATE_INTERVAL_MS) {
        return;
      }
      lastLcdUpdateAtRef.current = now;

      if (lcdBarsBeatsRef.current) {
        lcdBarsBeatsRef.current.textContent = formatBarsBeats(
          time,
          currentProject.bpm,
          beatsPerBar,
        );
      }

      if (lcdClockRef.current) {
        lcdClockRef.current.textContent = formatClock(time);
      }
    };

    updateDisplay(getTransportCurrentTime());
    return subscribeTransportCurrentTime(updateDisplay);
  }, [beatsPerBar, currentProject]);

  const handleSave = async () => {
    if (!currentProject) {
      return;
    }

    setIsBusy(true);
    const isSaved = await saveProject(currentProject);
    setIsBusy(false);
    setStatusMessage(
      isSaved ? "Project saved." : "Project could not be saved.",
    );
    if (isSaved) {
      markSaved();
    }
  };

  const handleImportMidi = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(`Importing ${file.name}...`);
    try {
      await importMidiFile(file);
      setStatusMessage(`${file.name} imported successfully.`);
    } catch (error) {
      console.error(error);
      setStatusMessage("MIDI import failed.");
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const handleImportAudio = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !currentProject) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(`Importing ${file.name}...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const targetTrackId =
        selectedTrack?.type === "audio"
          ? selectedTrack.id
          : addAudioTrack(file.name.replace(/\.[^.]+$/, ""));

      if (!targetTrackId) {
        throw new Error("Audio track could not be created");
      }

      await addAudioClip(targetTrackId, {
        name: file.name,
        startTime: 0,
        audioData: arrayBuffer,
        audioFileName: file.name,
        audioMimeType: file.type,
      });
      setStatusMessage(`${file.name} imported successfully.`);
    } catch (error) {
      console.error(error);
      setStatusMessage("Audio import failed.");
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const handleExport = async () => {
    if (!currentProject) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(`Exporting ${currentProject.name}...`);

    try {
      let didExport = false;

      if (exportTarget === "master") {
        didExport = await exportProjectToWav(currentProject, {
          useLoopRange: useLoopRangeForExport,
          loopStart: exportLoopStart,
          loopEnd: exportLoopEnd,
        });
      } else if (exportTarget === "stems") {
        didExport = await exportProjectToStems(currentProject, {
          useLoopRange: useLoopRangeForExport,
          loopStart: exportLoopStart,
          loopEnd: exportLoopEnd,
        });
      } else {
        const { createDawProjectArchive } =
          await import("@/utils/dawprojectExport");
        const { zipSync } = await import("fflate");
        const { archiveEntries, fileName } =
          createDawProjectArchive(currentProject);
        const zipData = zipSync(archiveEntries, { level: 6 });
        const zipBlob = new Blob([zipData], { type: "application/zip" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);
        didExport = true;
      }

      setStatusMessage(
        didExport ? `${currentProject.name} exported.` : "Export failed.",
      );
      if (didExport) {
        setIsExportDialogOpen(false);
      }
    } catch (error) {
      console.error(error);
      setStatusMessage("Export failed.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <div className="text-center">
            <p className="font-medium text-slate-200">Loading project...</p>
            {statusMessage && (
              <p className="mt-1 text-xs text-slate-500">{statusMessage}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const initialTransportTime = getTransportCurrentTime();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-daw-surface0 font-body text-slate-100 selection:bg-cyan-500/30">
      <header className="z-10 grid min-h-[88px] shrink-0 grid-cols-[minmax(280px,1fr)_minmax(340px,520px)_minmax(320px,1fr)] items-center gap-4 border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(17,22,34,0.96),rgba(9,12,20,0.94))] px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/"
            className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/6 bg-white/5 text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100"
            title="Back to projects"
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
          </Link>

          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Browser DAW Session
              </p>
              <h1 className="truncate font-display text-xl font-semibold tracking-[-0.03em] text-slate-50">
                {currentProject.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TOOL_OPTIONS.map((tool) => {
                const isActive = tool.id === activeTool;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold tracking-[0.14em] transition-all ${isActive ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]" : "border-white/8 bg-white/5 text-slate-400 hover:border-white/14 hover:bg-white/10 hover:text-slate-200"}`}
                    onClick={() => setActiveTool(tool.id)}
                    title={tool.hint}
                  >
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="daw-lcd rounded-[24px] px-4 py-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Tempo
              </p>
              <p className="daw-lcd-readout mt-1 text-lg font-semibold">
                {currentProject.bpm}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Meter
              </p>
              <p className="daw-lcd-readout mt-1 text-lg font-semibold">
                {beatsPerBar}/{beatUnit}
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Grid
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {GRID_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] transition ${gridDivision === option ? "bg-cyan-400/14 text-cyan-100" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}
                    onClick={() => setGridDivision(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Position
              </p>
              <p className="daw-lcd-readout mt-1 text-lg font-semibold">
                <span ref={lcdBarsBeatsRef}>
                  {formatBarsBeats(
                    initialTransportTime,
                    currentProject.bpm,
                    beatsPerBar,
                  )}
                </span>
              </p>
              <p
                ref={lcdClockRef}
                className="daw-lcd-readout text-[11px] text-[hsl(var(--daw-lcd-muted))]"
              >
                {formatClock(initialTransportTime)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-2 hidden rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-slate-300 xl:inline-flex">
            {isPlaying ? "Playing" : "Standby"}
          </div>
          {statusMessage && (
            <span className="mr-2 animate-in fade-in slide-in-from-right-2 text-xs font-medium tracking-wide text-cyan-300/85">
              {statusMessage}
            </span>
          )}
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
            onClick={() => addMidiTrack()}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add MIDI
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
            onClick={() => addAudioTrack()}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Audio
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
            onClick={() => midiFileInputRef.current?.click()}
          >
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            Import MIDI
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
            onClick={() => audioFileInputRef.current?.click()}
          >
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            Import Audio
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/5 px-3 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100 active:scale-95"
            onClick={() => setIsExportDialogOpen(true)}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Export
          </button>
          <div className="mx-1 hidden h-5 w-px bg-white/10 lg:block" />
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl bg-cyan-500/12 px-4 text-xs font-medium text-cyan-100 ring-1 ring-inset ring-cyan-400/30 transition-all hover:bg-cyan-500/22 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => void handleSave()}
            disabled={isBusy}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            Save
          </button>
          <input
            ref={midiFileInputRef}
            type="file"
            accept=".mid,.midi,audio/midi"
            className="hidden"
            onChange={handleImportMidi}
          />
          <input
            ref={audioFileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleImportAudio}
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel
            defaultSize={80}
            minSize={50}
            className="flex flex-col bg-[hsl(var(--daw-surface-1))]"
          >
            <PanelGroup direction="vertical">
              <Panel
                defaultSize={60}
                minSize={20}
                className="flex overflow-hidden"
              >
                <PanelGroup direction="horizontal">
                  <Panel
                    defaultSize={20}
                    minSize={15}
                    maxSize={30}
                    className="z-10 flex flex-col border-r border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,hsl(var(--daw-surface-2)),hsl(var(--daw-surface-1)))] shadow-[18px_0_42px_rgba(0,0,0,0.24)]"
                  >
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[hsl(var(--daw-panel-border))] bg-white/5 px-4">
                      <h2 className="daw-panel-title">
                        Tracks
                      </h2>
                      <span className="rounded-full bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-300">
                        {currentProject.tracks.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                      {currentProject.tracks.length === 0 ? (
                        <div className="mx-3 mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">
                          <p>Add a track to start</p>
                        </div>
                      ) : (
                        currentProject.tracks.map((track, index) => {
                          const isSelected = track.id === selectedTrack?.id;
                          const trackColor = track.trackColor ??
                            (track.type === "audio"
                              ? "var(--daw-track-audio)"
                              : "var(--daw-track-midi)");

                          return (
                            <div
                              key={track.id}
                              className={`group relative flex h-[84px] w-full cursor-pointer flex-col justify-center border-b border-white/5 px-4 py-3 text-left transition-all ${isSelected ? "bg-[hsl(var(--daw-track-row-selected)/0.85)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "hover:bg-[hsl(var(--daw-track-row-hover)/0.9)]"}`}
                              onClick={() => {
                                selectTrack(track.id);
                                selectClip(null);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  selectTrack(track.id);
                                  selectClip(null);
                                }
                              }}
                            >
                              <div
                                className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                                style={{
                                  backgroundColor:
                                    trackColor.startsWith("var")
                                      ? `hsl(${trackColor})`
                                      : `hsl(${trackColor})`,
                                }}
                              />
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="mb-1 flex items-center gap-2">
                                    <span
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-[10px] font-bold uppercase text-slate-100"
                                      style={{
                                        backgroundColor:
                                          trackColor.startsWith("var")
                                            ? `hsl(${trackColor})`
                                            : `hsl(${trackColor})`,
                                      }}
                                    >
                                      {track.type === "audio" ? "A" : "M"}
                                    </span>
                                    <p
                                      className={`truncate text-sm font-semibold tracking-tight ${isSelected ? "text-cyan-50" : "text-slate-100"}`}
                                    >
                                      {track.name}
                                    </p>
                                  </div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    {track.type === "audio"
                                      ? "Audio track"
                                      : "Instrument track"}{" "}
                                    #{index + 1}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-1 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeTrack(track.id);
                                  }}
                                  aria-label={`Remove ${track.name}`}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                  </svg>
                                </button>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold transition-all ${track.muted ? "border-red-500/40 bg-red-500/20 text-red-200" : "border-white/10 bg-black/20 text-slate-400 hover:text-slate-200"}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      useProjectStore
                                        .getState()
                                        .updateTrack(track.id, {
                                          muted: !track.muted,
                                        });
                                    }}
                                    title="Mute"
                                  >
                                    M
                                  </button>
                                  <button
                                    type="button"
                                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold transition-all ${track.solo ? "border-yellow-500/40 bg-yellow-500/20 text-yellow-100" : "border-white/10 bg-black/20 text-slate-400 hover:text-slate-200"}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      useProjectStore
                                        .getState()
                                        .updateTrack(track.id, {
                                          solo: !track.solo,
                                        });
                                    }}
                                    title="Solo"
                                  >
                                    S
                                  </button>
                                </div>

                                <div
                                  className="flex flex-1 items-center gap-3"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <span className="w-10 font-mono text-[10px] text-slate-400">
                                    {Math.round(track.volume * 100)}%
                                  </span>
                                  <Slider
                                    value={[track.volume]}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    onValueChange={(value) => {
                                      useProjectStore
                                        .getState()
                                        .updateTrack(track.id, {
                                          volume: value[0] ?? track.volume,
                                        });
                                    }}
                                    aria-label={`${track.name} volume`}
                                    className="w-full"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </Panel>

                  <PanelResizeHandle className="w-[4px] cursor-col-resize bg-[hsl(var(--daw-panel-border))] transition-colors hover:bg-cyan-500/50" />

                  <Panel defaultSize={80} className="relative bg-[hsl(var(--daw-surface-3))]">
                    <ArrangementView />
                  </Panel>
                </PanelGroup>
              </Panel>

              <PanelResizeHandle className="z-20 h-[4px] cursor-row-resize bg-[hsl(var(--daw-panel-border))] transition-colors hover:bg-cyan-500/50" />

              <Panel
                defaultSize={40}
                minSize={20}
                className="relative flex flex-col bg-[linear-gradient(180deg,hsl(var(--daw-surface-0)),hsl(var(--daw-surface-1)))] shadow-[0_-10px_28px_rgba(0,0,0,0.28)]"
              >
                {selectedTrack ? (
                  selectedTrack.type === "audio" ? (
                    <AudioEditor track={selectedTrack} />
                  ) : (
                    <MidiPianoRoll
                      track={selectedTrack}
                      clip={selectedClip}
                      duration={currentProject.duration}
                      bpm={currentProject.bpm}
                    />
                  )
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm font-medium text-slate-600">
                    Select a track or clip to edit
                  </div>
                )}
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="group relative z-10 w-[4px] bg-[hsl(var(--daw-panel-border))] outline-none">
            <div className="absolute inset-y-0 -inset-x-2 cursor-col-resize transition-colors group-hover:bg-cyan-500/24 group-active:bg-cyan-500/44" />
            <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12 opacity-80 transition-colors group-hover:bg-cyan-300" />
          </PanelResizeHandle>

          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={30}
            className="flex flex-col border-l border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,hsl(var(--daw-surface-2)),hsl(var(--daw-surface-1)))]"
          >
            <div className="flex h-12 shrink-0 items-center border-b border-[hsl(var(--daw-panel-border))] bg-white/5 px-4">
              <h2 className="daw-panel-title">
                Inspector
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
              {selectedTrack ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                      <div className="h-px flex-1 bg-white/10"></div>
                      Track Properties
                      <div className="h-px flex-1 bg-white/10"></div>
                    </h3>
                    <dl className="space-y-3">
                      <div className="rounded-[22px] border border-white/8 bg-black/18 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Instrument
                          </dt>
                          <dd className="text-[11px] font-semibold text-slate-200">
                            {selectedTrack.type === "midi"
                              ? getInstrumentDefinition(
                                  selectedTrack.instrument.patchId,
                                ).type
                              : "Sampler"}
                          </dd>
                        </div>
                        <dd>
                          {selectedTrack.type === "midi" ? (
                            <Select
                              value={
                                selectedTrack.instrument.patchId ||
                                "basic-synth"
                              }
                              onValueChange={(value) => {
                                const instrumentDefinition =
                                  getInstrumentDefinition(value);
                                useProjectStore
                                  .getState()
                                  .updateTrack(selectedTrack.id, {
                                    instrument: {
                                      type: instrumentDefinition.type,
                                      patchId: value,
                                      parameters: {},
                                    },
                                  });
                              }}
                            >
                              <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
                                <SelectValue placeholder="Select an instrument" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
                                {Object.values(INSTRUMENTS).map((instrument) => (
                                  <SelectItem
                                    key={instrument.id}
                                    value={instrument.id}
                                    className="rounded-xl py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
                                  >
                                    {instrument.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            selectedTrack.instrument.patchId ||
                            selectedTrack.instrument.type
                          )}
                        </dd>
                      </div>
                      <div className="group flex flex-col gap-3 rounded-[22px] border border-white/8 bg-black/18 px-4 py-4 transition-colors hover:bg-white/6">
                        <div className="flex items-center justify-between">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Volume
                          </dt>
                          <dd className="font-mono text-xs font-semibold text-cyan-100">
                            {Math.round(selectedTrack.volume * 100)}%
                          </dd>
                        </div>
                        <Slider
                          value={[selectedTrack.volume]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(value) => {
                            useProjectStore
                              .getState()
                              .updateTrack(selectedTrack.id, {
                                volume: value[0] ?? selectedTrack.volume,
                              });
                          }}
                          aria-label={`${selectedTrack.name} volume`}
                          className="w-full"
                        />
                      </div>
                      <div className="group flex flex-col gap-3 rounded-[22px] border border-white/8 bg-black/18 px-4 py-4 transition-colors hover:bg-white/6">
                        <div className="flex items-center justify-between">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Pan
                          </dt>
                          <dd className="font-mono text-xs font-semibold text-slate-200">
                            {formatPanLabel(selectedTrack.pan)}
                          </dd>
                        </div>
                        <Slider
                          value={[selectedTrack.pan]}
                          min={-1}
                          max={1}
                          step={0.01}
                          onValueChange={(value) => {
                            useProjectStore
                              .getState()
                              .updateTrack(selectedTrack.id, {
                                pan: value[0] ?? selectedTrack.pan,
                              });
                          }}
                          aria-label={`${selectedTrack.name} pan`}
                          className="w-full"
                        />
                      </div>
                    </dl>
                  </div>

                  <div>
                    <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                      <div className="h-px flex-1 bg-white/10"></div>
                      Channel Strip
                      <div className="h-px flex-1 bg-white/10"></div>
                    </h3>
                    <div className="space-y-3">
                      <div className="rounded-[22px] border border-white/8 bg-black/18 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            EQ
                          </p>
                          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-slate-300">
                            Preview
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            ["Low", "-2.0dB"],
                            ["Mid", "+1.5dB"],
                            ["High", "+3.0dB"],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-2xl border border-white/8 bg-white/5 p-3"
                            >
                              <div className="mb-16 h-20 rounded-xl bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(255,255,255,0.04))]" />
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                {label}
                              </p>
                              <p className="mt-1 font-mono text-[11px] text-slate-200">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-white/8 bg-black/18 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Inserts
                          </p>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            4 slots
                          </span>
                        </div>
                        <div className="space-y-2">
                          {["Channel EQ", "Compressor", "Stereo Delay", "Empty"].map((slot, slotIndex) => (
                            <div
                              key={`${slot}-${slotIndex}`}
                              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-3 py-2.5"
                            >
                              <span className="text-xs font-medium text-slate-200">
                                {slot}
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {slot === "Empty" ? "Add" : "On"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-white/8 bg-black/18 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Sends
                          </p>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            2 slots
                          </span>
                        </div>
                        <div className="space-y-2">
                          {["Bus 1 Reverb", "Bus 2 Parallel Comp"].map((slot) => (
                            <div
                              key={slot}
                              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-3 py-2.5"
                            >
                              <span className="text-xs font-medium text-slate-200">
                                {slot}
                              </span>
                              <span className="font-mono text-[11px] text-cyan-100">
                                -12.0 dB
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                      <div className="h-px flex-1 bg-white/10"></div>
                      Clip Info
                      <div className="h-px flex-1 bg-white/10"></div>
                    </h3>
                    <dl className="space-y-2">
                      <div className="group flex items-center justify-between rounded-[20px] border border-white/8 bg-black/18 px-3 py-3 transition-colors hover:bg-white/6">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Notes
                        </dt>
                        <dd className="font-mono text-xs font-semibold text-slate-200">
                          {selectedClip?.notes.length ?? 0}
                        </dd>
                      </div>
                      <div className="group flex items-center justify-between rounded-[20px] border border-white/8 bg-black/18 px-3 py-3 transition-colors hover:bg-white/6">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Start
                        </dt>
                        <dd className="font-mono text-xs font-semibold text-slate-200">
                          {selectedClip ? formatClock(selectedClip.startTime) : "00:00.00"}
                        </dd>
                      </div>
                      <div className="group flex items-center justify-between rounded-[20px] border border-white/8 bg-black/18 px-3 py-3 transition-colors hover:bg-white/6">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Length
                        </dt>
                        <dd className="font-mono text-xs font-semibold text-slate-200">
                          {selectedClip ? formatClock(selectedClip.duration) : "00:00.00"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {aafImportMetadata && (
                    <div>
                      <h3 className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                        <div className="h-px flex-1 bg-white/10"></div>
                        AAF Import
                        <div className="h-px flex-1 bg-white/10"></div>
                      </h3>

                      <div className="mb-3 rounded-[20px] border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 text-[11px] text-cyan-100/80">
                        <p className="font-semibold text-cyan-100">
                          {aafImportMetadata.summary ?? "Imported from AAF"}
                        </p>
                        <p className="mt-1 text-cyan-100/70">
                          Rates: {aafImportMetadata.aafRates?.length ?? 0} •
                          Hints: {aafImportMetadata.aafHints?.length ?? 0}
                        </p>
                      </div>

                      {selectedAafHint ? (
                        <dl className="space-y-2">
                          <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                            <dt className="text-xs text-slate-500">Match</dt>
                            <dd className="text-right text-[11px] font-semibold text-slate-200">
                              {selectedAafHint.matchedBy ?? "heuristic"}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                            <dt className="text-xs text-slate-500">Entry</dt>
                            <dd className="max-w-[60%] truncate text-right text-[11px] font-semibold text-slate-200">
                              {selectedAafHint.entryPath}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                            <dt className="text-xs text-slate-500">Start</dt>
                            <dd className="text-right text-[11px] font-semibold text-slate-200">
                              {selectedAafHint.startTime?.toFixed(3) ?? "0.000"}
                              s
                              {selectedAafHint.startRawValue !== undefined && (
                                <span className="ml-1 text-slate-500">
                                  ({selectedAafHint.startRawValue}{" "}
                                  {selectedAafHint.startUnit ?? "raw"})
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                            <dt className="text-xs text-slate-500">Duration</dt>
                            <dd className="text-right text-[11px] font-semibold text-slate-200">
                              {selectedAafHint.duration?.toFixed(3) ?? "-"}s
                              {selectedAafHint.durationRawValue !==
                                undefined && (
                                <span className="ml-1 text-slate-500">
                                  ({selectedAafHint.durationRawValue}{" "}
                                  {selectedAafHint.durationUnit ?? "raw"})
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                            <dt className="text-xs text-slate-500">Rate</dt>
                            <dd className="text-right text-[11px] font-semibold text-slate-200">
                              {selectedAafHint.rate
                                ? `${selectedAafHint.rate.toFixed(3)} ${selectedAafHint.rateKind ?? "rate"}`
                                : "not detected"}
                            </dd>
                          </div>
                          {selectedAafHint.slotId !== undefined && (
                            <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                              <dt className="text-xs text-slate-500">
                                Slot ID
                              </dt>
                              <dd className="text-right text-[11px] font-semibold text-slate-200">
                                {selectedAafHint.slotId}
                              </dd>
                            </div>
                          )}
                        </dl>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-800/60 px-3 py-3 text-xs text-slate-500">
                          No track-specific AAF hint matched the current
                          selection.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-8 text-center text-xs text-slate-400">
                  Select a track to inspect it.
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div className="z-20 shrink-0 border-t border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(11,17,28,0.96),rgba(9,13,22,0.98))] shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        <TransportBar duration={currentProject.duration} />
      </div>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="border-slate-800 bg-slate-950 text-slate-100 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export Project</DialogTitle>
            <DialogDescription className="text-slate-400">
              Render a master mix, package stems, or bundle the project as a
              prototype .dawproject archive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Format
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "master",
                    label: "Master WAV",
                    description: "Single stereo mixdown",
                  },
                  {
                    id: "stems",
                    label: "Stems ZIP",
                    description: "One WAV per audible track",
                  },
                  {
                    id: "dawproject",
                    label: ".dawproject",
                    description: "XML + bundled source assets",
                  },
                ].map((option) => {
                  const isSelected = exportTarget === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-lg border px-3 py-3 text-left transition-all ${isSelected ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100" : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:bg-slate-900"}`}
                      onClick={() => setExportTarget(option.id as ExportTarget)}
                    >
                      <div className="text-xs font-semibold">
                        {option.label}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`rounded-lg border px-4 py-3 ${exportTarget === "dawproject" ? "border-slate-800/60 bg-slate-900/30 opacity-60" : "border-slate-800 bg-slate-900/50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Use Loop Range
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Restrict master or stem rendering to the current transport
                    loop points.
                  </p>
                </div>
                <Switch
                  checked={useLoopRangeForExport}
                  onCheckedChange={setUseLoopRangeForExport}
                  disabled={exportTarget === "dawproject"}
                />
              </div>

              {useLoopRangeForExport && exportTarget !== "dawproject" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-400">
                    Loop In
                    <input
                      type="number"
                      min={0}
                      max={currentProject.duration}
                      step={0.25}
                      value={exportLoopStart}
                      onChange={(event) =>
                        setExportLoopStart(Number(event.target.value))
                      }
                      className="h-9 rounded-md border border-slate-700/50 bg-[#0B0F19] px-3 font-mono text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/50"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Loop Out
                    <input
                      type="number"
                      min={0}
                      max={currentProject.duration}
                      step={0.25}
                      value={exportLoopEnd}
                      onChange={(event) =>
                        setExportLoopEnd(Number(event.target.value))
                      }
                      className="h-9 rounded-md border border-slate-700/50 bg-[#0B0F19] px-3 font-mono text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/50"
                    />
                  </label>
                </div>
              )}
            </div>

            {exportTarget === "dawproject" && (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] text-cyan-100/80">
                This prototype archive bundles project.xml, metadata.json, and
                raw audio assets for future DAWProject import/export work.
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-transparent px-4 text-sm text-slate-300 transition hover:bg-slate-900"
              onClick={() => setIsExportDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md bg-cyan-500/15 px-4 text-sm font-medium text-cyan-200 ring-1 ring-inset ring-cyan-500/30 transition hover:bg-cyan-500/25 disabled:pointer-events-none disabled:opacity-50"
              onClick={() => void handleExport()}
              disabled={isBusy}
            >
              Export Now
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectPage;
