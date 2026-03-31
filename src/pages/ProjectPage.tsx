import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Download,
  FileUp,
  MousePointer2,
  Plus,
  Save,
  Scissors,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AudioEditor from "@/components/editor/AudioEditor";
import { ArrangementView } from "@/components/editor/ArrangementView";
import MidiPianoRoll from "@/components/editor/MidiPianoRoll";
import InstrumentParameterEditor from "@/components/project/InstrumentParameterEditor";
import QwertyMidiKeyboardDialog from "@/components/project/QwertyMidiKeyboardDialog";
import {
  getInstrumentDefinition,
  listInstrumentDefinitions,
} from "@/audio/instruments";
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
import { useMidiInput } from "@/hooks/useMidiInput";
import { useProjectDatabase } from "@/hooks/useProjectDatabase";
import { createDefaultTrackInstrument } from "@/projects/projectSchema";
import { useTransport } from "@/hooks/useTransport";
import { useProjectStore } from "@/stores/projectStore";
import {
  getTransportCurrentTime,
  subscribeTransportCurrentTime,
} from "@/stores/transportStore";
import type {
  AafImportDebugHint,
  LiveMidiMessage,
  MidiNote,
  Project,
  ProjectTool,
  ProjectTrack,
} from "@/types";
import { dispatchLiveMidiCommand } from "@/utils/liveMidiController";
import { GRID_DIVISIONS, type GridDivision } from "@/utils/grid";

type ExportTarget = "master" | "stems" | "dawproject";

const TOOL_OPTIONS: Array<{
  id: ProjectTool;
  label: string;
  hint: string;
  icon: typeof MousePointer2;
}> = [
  {
    id: "pointer",
    label: "Move",
    hint: "Move clips and edit edges",
    icon: MousePointer2,
  },
  {
    id: "split",
    label: "Split",
    hint: "Split clips at the cursor",
    icon: Scissors,
  },
  {
    id: "trim",
    label: "Trim",
    hint: "Trim clip boundaries",
    icon: ArrowLeftRight,
  },
];
const LCD_UPDATE_INTERVAL_MS = 80;
const RECORDING_FLUSH_INTERVAL_MS = 96;
const MIN_RECORDED_NOTE_DURATION = 0.05;
const QWERTY_INPUT_ID = "qwerty";
const INSTRUMENT_OPTIONS = listInstrumentDefinitions();

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

const HeaderPanelGlyph = ({ panel }: { panel: "editor" | "inspector" }) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <rect
      x="2"
      y="3"
      width="16"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    {panel === "editor" ? (
      <>
        <path d="M2 9.5H18" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M6 12.5H14"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </>
    ) : (
      <>
        <path d="M12.5 3V17" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M5 7H10"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </>
    )}
  </svg>
);

const HeaderActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    children: ReactNode;
    label: string;
  }
>(
  (
    { active = false, children, label, className, type = "button", ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all active:scale-95 ${active ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-100" : "border-white/8 bg-white/5 text-slate-300 hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-100"}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  ),
);

HeaderActionButton.displayName = "HeaderActionButton";

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

const MIDI_FILE_PATTERN = /\.(mid|midi)$/i;

const isMidiAsset = (file: File) => {
  const mimeType = file.type.toLowerCase();

  return (
    MIDI_FILE_PATTERN.test(file.name) ||
    mimeType === "audio/midi" ||
    mimeType === "audio/x-midi" ||
    mimeType === "application/midi" ||
    mimeType === "application/x-midi"
  );
};

const isAudioAsset = (file: File) =>
  !isMidiAsset(file) && file.type.toLowerCase().startsWith("audio/");

const hasDraggedFiles = (dataTransfer: DataTransfer | null) =>
  Array.from(dataTransfer?.types ?? []).includes("Files");

const openFilePicker = (input: HTMLInputElement | null) => {
  if (!input) {
    return;
  }

  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus({ preventScroll: true });
    input.click();
  } catch {
    input.click();
  }
};

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const midiFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const lcdBarsBeatsRef = useRef<HTMLParagraphElement | null>(null);
  const lcdClockRef = useRef<HTMLParagraphElement | null>(null);
  const activeRecordingNotesRef = useRef<
    Map<string, { pitch: number; startTime: number; velocity: number }>
  >(new Map());
  const currentProjectRef = useRef<Project | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);
  const lastLcdUpdateAtRef = useRef(0);
  const pendingRecordedNotesRef = useRef<MidiNote[]>([]);
  const recordingClipIdRef = useRef<string | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const recordingTrackIdRef = useRef<string | null>(null);
  const selectedTrackRef = useRef<ProjectTrack | null>(null);
  const fileDragDepthRef = useRef(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDeleteClipDialogOpen, setIsDeleteClipDialogOpen] = useState(false);
  const [isDeleteTrackDialogOpen, setIsDeleteTrackDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [isQwertyKeyboardOpen, setIsQwertyKeyboardOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<ExportTarget>("master");
  const [useLoopRangeForExport, setUseLoopRangeForExport] = useState(false);
  const [exportLoopStart, setExportLoopStart] = useState(0);
  const [exportLoopEnd, setExportLoopEnd] = useState(8);
  const [gridDivision, setGridDivision] = useState<GridDivision>("1/16");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const {
    activeTool,
    addAudioClip,
    addAudioTrack,
    addMidiTrack,
    appendNotesToClip,
    createRecordingMidiClip,
    currentProject,
    currentProjectId,
    importMidiFile,
    loadProject,
    markSaved,
    removeTrack,
    removeClip,
    selectClip,
    selectTrack,
    selectedClipId,
    selectedTrackId,
    setActiveTool,
    toggleTrackRecordArm,
    updateProjectSettings,
  } = useProjectStore();
  const { getProject, saveProject } = useProjectDatabase();
  const { exportProjectToStems, exportProjectToWav } = useAudioExport();
  const {
    activeInputId,
    inputMode,
    isLoopEnabled,
    isPlaying,
    isRecording,
    loopEnd,
    loopStart,
    play,
    recordingClipId,
    recordingStartTime,
    recordingTrackId,
    setActiveInput,
    startRecording,
    stopRecording,
  } = useTransport();
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

  useEffect(() => {
    if (!isPlaying && isRecording) {
      finalizeRecordingSession();
      setStatusMessage("Recording finalized at transport stop.");
    }
  }, [isPlaying, isRecording]);

  useEffect(() => {
    return () => {
      dispatchLiveMidiCommand({ type: "all-notes-off" });
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

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
  const selectedMidiClip =
    selectedTrack?.type === "midi" && selectedClip?.clipType === "midi"
      ? selectedClip
      : null;
  const selectedAudioClip =
    selectedTrack?.type === "audio" && selectedClip?.clipType === "audio"
      ? selectedClip
      : null;
  const armedMidiTrack = useMemo(() => {
    return (
      currentProject?.tracks.find(
        (track) => track.type === "midi" && track.recordArmed,
      ) ?? null
    );
  }, [currentProject]);

  const aafImportMetadata =
    currentProject?.importMetadata?.sourceFormat === "aaf"
      ? currentProject.importMetadata
      : null;
  const beatsPerBar = currentProject?.timeSignatureNumerator ?? 4;
  const beatUnit = currentProject?.timeSignatureDenominator ?? 4;

  currentProjectRef.current = currentProject;
  selectedTrackRef.current = selectedTrack;
  recordingClipIdRef.current = recordingClipId;
  recordingStartTimeRef.current = recordingStartTime;
  recordingTrackIdRef.current = recordingTrackId;

  const flushPendingRecordedNotes = () => {
    if (flushTimeoutRef.current !== null) {
      window.clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    const trackId = recordingTrackIdRef.current;
    const clipId = recordingClipIdRef.current;
    if (!trackId || !clipId || pendingRecordedNotesRef.current.length === 0) {
      return;
    }

    const nextNotes = pendingRecordedNotesRef.current.splice(
      0,
      pendingRecordedNotesRef.current.length,
    );
    appendNotesToClip(trackId, clipId, nextNotes);
  };

  const scheduleRecordedNotesFlush = () => {
    if (flushTimeoutRef.current !== null) {
      return;
    }

    flushTimeoutRef.current = window.setTimeout(() => {
      flushTimeoutRef.current = null;
      flushPendingRecordedNotes();
    }, RECORDING_FLUSH_INTERVAL_MS);
  };

  const finalizeActiveRecordedNote = (noteKey: string, endTime: number) => {
    const activeNote = activeRecordingNotesRef.current.get(noteKey);
    const clipStart = recordingStartTimeRef.current;
    if (!activeNote || clipStart === null) {
      return;
    }

    activeRecordingNotesRef.current.delete(noteKey);
    const relativeStart = Math.max(0, activeNote.startTime - clipStart);
    const duration = Math.max(
      MIN_RECORDED_NOTE_DURATION,
      endTime - activeNote.startTime,
    );

    pendingRecordedNotesRef.current.push({
      id: crypto.randomUUID(),
      pitch: activeNote.pitch,
      startTime: relativeStart,
      duration,
      velocity: activeNote.velocity,
    });
    scheduleRecordedNotesFlush();
  };

  const resolveLiveTargetTrack = () => {
    const project = currentProjectRef.current;
    if (!project) {
      return null;
    }

    const armedTrack = project.tracks.find(
      (track) => track.type === "midi" && track.recordArmed,
    );
    if (armedTrack) {
      return armedTrack;
    }

    if (selectedTrackRef.current?.type === "midi") {
      return selectedTrackRef.current;
    }

    return project.tracks.find((track) => track.type === "midi") ?? null;
  };

  const finalizeRecordingSession = () => {
    const clipId = recordingClipIdRef.current;
    const trackId = recordingTrackIdRef.current;
    const finishTime = getTransportCurrentTime();

    Array.from(activeRecordingNotesRef.current.keys()).forEach((noteKey) => {
      finalizeActiveRecordedNote(noteKey, finishTime);
    });
    flushPendingRecordedNotes();
    activeRecordingNotesRef.current.clear();
    stopRecording();

    if (!trackId || !clipId) {
      return;
    }

    const clip = useProjectStore
      .getState()
      .currentProject?.tracks.find((track) => track.id === trackId)
      ?.clips.find((candidate) => candidate.id === clipId);

    if (!clip || clip.clipType !== "midi" || clip.notes.length > 0) {
      return;
    }

    removeClip(trackId, clipId);
  };

  const handleDeleteSelectedMidiTrack = () => {
    if (selectedTrack?.type !== "midi") {
      return;
    }

    const deletedTrackName = selectedTrack.name;

    if (isRecording && recordingTrackIdRef.current === selectedTrack.id) {
      finalizeRecordingSession();
    }

    removeTrack(selectedTrack.id);
    setIsDeleteTrackDialogOpen(false);
    setStatusMessage(`${deletedTrackName} was removed.`);
  };

  const handleDeleteSelectedMidiClip = () => {
    if (selectedTrack?.type !== "midi" || !selectedMidiClip) {
      return;
    }

    const deletedClipName = selectedMidiClip.name;

    if (isRecording && recordingClipIdRef.current === selectedMidiClip.id) {
      finalizeRecordingSession();
    }

    removeClip(selectedTrack.id, selectedMidiClip.id);
    setIsDeleteClipDialogOpen(false);
    setStatusMessage(`${deletedClipName} was removed.`);
  };

  const handleLiveMidiMessage = (message: LiveMidiMessage) => {
    const targetTrack = resolveLiveTargetTrack();
    if (!targetTrack) {
      return;
    }

    const noteKey = `${message.sourceId}:${message.channel}:${message.pitch}`;

    if (message.type === "noteon") {
      dispatchLiveMidiCommand({
        type: "noteon",
        trackId: targetTrack.id,
        noteKey,
        pitch: message.pitch,
        velocity: message.velocity,
      });

      if (
        isRecording &&
        recordingTrackIdRef.current === targetTrack.id &&
        recordingStartTimeRef.current !== null
      ) {
        const currentTime = getTransportCurrentTime();
        finalizeActiveRecordedNote(noteKey, currentTime);
        activeRecordingNotesRef.current.set(noteKey, {
          pitch: message.pitch,
          startTime: currentTime,
          velocity: message.velocity,
        });
      }
      return;
    }

    dispatchLiveMidiCommand({
      type: "noteoff",
      trackId: targetTrack.id,
      noteKey,
    });

    if (isRecording && recordingTrackIdRef.current === targetTrack.id) {
      finalizeActiveRecordedNote(noteKey, getTransportCurrentTime());
    }
  };

  const {
    activeInput,
    activeInputId: selectedInputId,
    inputMode: selectedInputMode,
    inputs,
    isWebMidiSupported,
    pressedQwertyKeys,
    pressQwertyKey,
    releaseAllQwertyKeys,
    releaseQwertyKey,
    setActiveInputId: setMidiInputId,
    supportMessage,
  } = useMidiInput({
    onMessage: handleLiveMidiMessage,
  });

  const openQwertyKeyboard = () => {
    setMidiInputId(QWERTY_INPUT_ID);

    if (!armedMidiTrack) {
      const fallbackTrack =
        (selectedTrack?.type === "midi" ? selectedTrack : null) ??
        currentProject?.tracks.find((track) => track.type === "midi") ??
        null;

      if (fallbackTrack) {
        toggleTrackRecordArm(fallbackTrack.id);
        setStatusMessage(`${fallbackTrack.name} armed for QWERTY MIDI.`);
      } else {
        setStatusMessage("Add a MIDI track to use the QWERTY keyboard.");
      }
    }

    setIsQwertyKeyboardOpen(true);
  };

  useEffect(() => {
    setActiveInput(selectedInputMode, selectedInputId);
  }, [selectedInputId, selectedInputMode, setActiveInput]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (isQwertyKeyboardOpen) {
        setIsQwertyKeyboardOpen(false);
        return;
      }

      openQwertyKeyboard();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQwertyKeyboardOpen, openQwertyKeyboard]);

  useEffect(() => {
    dispatchLiveMidiCommand({ type: "all-notes-off" });
  }, [selectedInputId]);

  useEffect(() => {
    if (!isQwertyKeyboardOpen) {
      releaseAllQwertyKeys();
    }
  }, [isQwertyKeyboardOpen, releaseAllQwertyKeys]);

  const handleToggleRecording = () => {
    if (isRecording) {
      finalizeRecordingSession();
      setStatusMessage("MIDI recording stopped.");
      return;
    }

    if (!armedMidiTrack) {
      setStatusMessage("Arm one MIDI track before recording.");
      return;
    }

    const startTime = getTransportCurrentTime();
    const clipId = createRecordingMidiClip(armedMidiTrack.id, startTime);
    if (!clipId) {
      setStatusMessage("Unable to create a recording clip.");
      return;
    }

    pendingRecordedNotesRef.current = [];
    activeRecordingNotesRef.current.clear();
    startRecording({
      trackId: armedMidiTrack.id,
      clipId,
      startTime,
    });

    if (!isPlaying) {
      play();
    }

    setStatusMessage(`Recording armed to ${armedMidiTrack.name}.`);
  };

  const selectedAafHint = useMemo<AafImportDebugHint | null>(() => {
    if (!aafImportMetadata?.aafHints?.length || !selectedTrack) {
      return null;
    }

    const audioFileName = selectedAudioClip?.audioFileName;

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
  }, [aafImportMetadata, selectedAudioClip?.audioFileName, selectedTrack]);
  const inputModeLabel = selectedInputMode === "qwerty" ? "QWERTY" : "Web MIDI";
  const inputLabel = activeInput?.name ?? "Computer Keyboard";
  const inputHint =
    supportMessage ??
    (selectedInputMode === "qwerty"
      ? "Use the Z-M and Q-P rows to play notes from the computer keyboard."
      : "Arm a MIDI track and play from the selected controller.");

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

  const handleTempoChange = (value: string) => {
    const nextBpm = Number(value);
    if (Number.isNaN(nextBpm)) {
      return;
    }

    updateProjectSettings({
      bpm: Math.min(300, Math.max(20, Math.round(nextBpm))),
    });
  };

  const handleTimeSignatureChange = (
    field: "timeSignatureNumerator" | "timeSignatureDenominator",
    value: string,
  ) => {
    const nextValue = Number(value);
    if (Number.isNaN(nextValue)) {
      return;
    }

    updateProjectSettings({
      [field]: Math.min(
        field === "timeSignatureNumerator" ? 12 : 16,
        Math.max(1, Math.round(nextValue)),
      ),
    });
  };

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

  const importMidiAsset = async (file: File) => {
    await importMidiFile(file);
  };

  const importAudioAsset = async (file: File) => {
    const project = currentProjectRef.current;
    if (!project) {
      throw new Error("Project is not loaded");
    }

    const arrayBuffer = await file.arrayBuffer();
    const targetTrackId =
      selectedTrackRef.current?.type === "audio"
        ? selectedTrackRef.current.id
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
  };

  const importFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter(
      (file) => isMidiAsset(file) || isAudioAsset(file),
    );
    const skippedCount = files.length - supportedFiles.length;

    if (supportedFiles.length === 0) {
      setStatusMessage("No supported MIDI or audio files were selected.");
      return;
    }

    setIsBusy(true);

    const importedNames: string[] = [];
    const failedNames: string[] = [];

    for (const file of supportedFiles) {
      setStatusMessage(`Importing ${file.name}...`);

      try {
        if (isMidiAsset(file)) {
          await importMidiAsset(file);
        } else {
          await importAudioAsset(file);
        }

        importedNames.push(file.name);
      } catch (error) {
        console.error(error);
        failedNames.push(file.name);
      }
    }

    setIsBusy(false);

    if (
      failedNames.length === 0 &&
      skippedCount === 0 &&
      importedNames.length === 1
    ) {
      setStatusMessage(`${importedNames[0]} imported successfully.`);
      return;
    }

    const summary = [
      importedNames.length > 0
        ? `Imported ${importedNames.length} file${importedNames.length === 1 ? "" : "s"}`
        : null,
      failedNames.length > 0 ? `${failedNames.length} failed` : null,
      skippedCount > 0 ? `${skippedCount} unsupported` : null,
    ]
      .filter(Boolean)
      .join(". ");

    setStatusMessage(summary || "Import finished.");
  };

  const handleImportMidi = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    await importFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleImportAudio = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    await importFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleFileDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current += 1;
    setIsFileDragActive(true);
  };

  const handleFileDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isFileDragActive) {
      setIsFileDragActive(true);
    }
  };

  const handleFileDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);

    if (fileDragDepthRef.current === 0) {
      setIsFileDragActive(false);
    }
  };

  const handleFileDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current = 0;
    setIsFileDragActive(false);
    await importFiles(Array.from(event.dataTransfer.files));
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
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-daw-surface0 font-body text-slate-100 selection:bg-cyan-500/30"
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <header className="z-10 grid min-h-[88px] shrink-0 grid-cols-[minmax(260px,1fr)_minmax(360px,560px)_minmax(280px,1fr)] items-center gap-4 border-b border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(17,22,34,0.96),rgba(9,12,20,0.94))] px-4 py-3 backdrop-blur-md">
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
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold tracking-[0.14em] transition-all ${isActive ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]" : "border-white/8 bg-white/5 text-slate-400 hover:border-white/14 hover:bg-white/10 hover:text-slate-200"}`}
                    onClick={() => setActiveTool(tool.id)}
                    title={tool.hint}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-3.5 w-3.5" />
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
              <input
                type="number"
                min={20}
                max={300}
                value={currentProject.bpm}
                onChange={(event) => handleTempoChange(event.target.value)}
                className="daw-lcd-readout mt-1 w-full bg-transparent text-lg font-semibold outline-none"
                aria-label="Project tempo"
              />
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Meter
              </p>
              <div className="mt-1 flex items-center gap-1 daw-lcd-readout text-lg font-semibold">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={beatsPerBar}
                  onChange={(event) =>
                    handleTimeSignatureChange(
                      "timeSignatureNumerator",
                      event.target.value,
                    )
                  }
                  className="w-8 bg-transparent text-center outline-none"
                  aria-label="Time signature numerator"
                />
                <span>/</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={beatUnit}
                  onChange={(event) =>
                    handleTimeSignatureChange(
                      "timeSignatureDenominator",
                      event.target.value,
                    )
                  }
                  className="w-8 bg-transparent text-center outline-none"
                  aria-label="Time signature denominator"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[hsl(var(--daw-lcd-muted))]">
                Grid
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {GRID_DIVISIONS.map((option) => (
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

        <TooltipProvider delayDuration={120}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="mr-1 hidden rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-slate-300 xl:inline-flex">
              {isPlaying ? "Playing" : "Standby"}
            </div>
            {statusMessage && (
              <span className="mr-1 animate-in fade-in slide-in-from-right-2 text-xs font-medium tracking-wide text-cyan-300/85">
                {statusMessage}
              </span>
            )}

            <DropdownMenu
              open={isImportMenuOpen}
              onOpenChange={setIsImportMenuOpen}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <HeaderActionButton label="Add track">
                      <Plus className="h-4 w-4" />
                    </HeaderActionButton>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Add track</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100"
              >
                <DropdownMenuItem
                  className="rounded-xl focus:bg-white/8"
                  onClick={() => addMidiTrack()}
                >
                  Add MIDI track
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-xl focus:bg-white/8"
                  onClick={() => addAudioTrack()}
                >
                  Add audio track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <HeaderActionButton label="Import assets">
                      <FileUp className="h-4 w-4" />
                    </HeaderActionButton>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Import</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100"
              >
                <DropdownMenuItem
                  className="rounded-xl focus:bg-white/8"
                  onSelect={(event) => {
                    event.preventDefault();
                    openFilePicker(midiFileInputRef.current);
                    setIsImportMenuOpen(false);
                  }}
                >
                  Import MIDI
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-xl focus:bg-white/8"
                  onSelect={(event) => {
                    event.preventDefault();
                    openFilePicker(audioFileInputRef.current);
                    setIsImportMenuOpen(false);
                  }}
                >
                  Import audio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderActionButton
                  label="Export project"
                  onClick={() => setIsExportDialogOpen(true)}
                >
                  <Download className="h-4 w-4" />
                </HeaderActionButton>
              </TooltipTrigger>
              <TooltipContent>Export</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderActionButton
                  label="Save project"
                  onClick={() => void handleSave()}
                  active={!isBusy}
                >
                  <Save className="h-4 w-4" />
                </HeaderActionButton>
              </TooltipTrigger>
              <TooltipContent>Save</TooltipContent>
            </Tooltip>

            <div className="mx-1 hidden h-5 w-px bg-white/10 lg:block" />

            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderActionButton
                  label={
                    isBottomPanelOpen
                      ? "Hide detail editor"
                      : "Show detail editor"
                  }
                  active={isBottomPanelOpen}
                  onClick={() => setIsBottomPanelOpen((current) => !current)}
                >
                  <HeaderPanelGlyph panel="editor" />
                </HeaderActionButton>
              </TooltipTrigger>
              <TooltipContent>
                {isBottomPanelOpen
                  ? "Hide detail editor"
                  : "Show detail editor"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderActionButton
                  label={isInspectorOpen ? "Hide inspector" : "Show inspector"}
                  active={isInspectorOpen}
                  onClick={() => setIsInspectorOpen((current) => !current)}
                >
                  <HeaderPanelGlyph panel="inspector" />
                </HeaderActionButton>
              </TooltipTrigger>
              <TooltipContent>
                {isInspectorOpen ? "Hide inspector" : "Show inspector"}
              </TooltipContent>
            </Tooltip>

            <input
              ref={midiFileInputRef}
              type="file"
              accept=".mid,.midi,audio/midi"
              className="sr-only"
              onChange={handleImportMidi}
            />
            <input
              ref={audioFileInputRef}
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={handleImportAudio}
            />
          </div>
        </TooltipProvider>
      </header>

      <div
        className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-opacity duration-150 ${isFileDragActive ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),rgba(2,6,23,0.84)_58%)] backdrop-blur-[2px]" />
        <div className="relative rounded-[32px] border border-cyan-300/35 bg-[linear-gradient(180deg,rgba(8,145,178,0.16),rgba(15,23,42,0.9))] px-10 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200/90">
            Import Files
          </p>
          <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-slate-50">
            Drop MIDI or audio files here
          </p>
          <p className="mt-2 text-sm font-medium text-slate-300">
            MIDI creates instrument clips. Audio lands on the selected audio
            track or creates a new one.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel
            defaultSize={isInspectorOpen ? 78 : 100}
            minSize={50}
            className="flex flex-col bg-[hsl(var(--daw-surface-1))]"
          >
            <PanelGroup direction="vertical">
              <Panel
                defaultSize={isBottomPanelOpen ? 62 : 100}
                minSize={20}
                className="flex overflow-hidden"
              >
                <ArrangementView gridDivision={gridDivision} />
              </Panel>

              {isBottomPanelOpen && (
                <>
                  <PanelResizeHandle className="z-20 h-[4px] cursor-row-resize bg-[hsl(var(--daw-panel-border))] transition-colors hover:bg-cyan-500/50" />

                  <Panel
                    defaultSize={38}
                    minSize={20}
                    className="relative flex flex-col bg-[linear-gradient(180deg,hsl(var(--daw-surface-0)),hsl(var(--daw-surface-1)))] shadow-[0_-10px_28px_rgba(0,0,0,0.28)]"
                  >
                    {selectedTrack ? (
                      selectedTrack.type === "audio" ? (
                        <AudioEditor
                          track={selectedTrack}
                          gridDivision={gridDivision}
                        />
                      ) : (
                        <MidiPianoRoll
                          track={selectedTrack}
                          clip={selectedMidiClip}
                          duration={currentProject.duration}
                          bpm={currentProject.bpm}
                          beatsPerBar={beatsPerBar}
                          gridDivision={gridDivision}
                        />
                      )
                    ) : (
                      <div className="flex flex-1 items-center justify-center text-sm font-medium text-slate-600">
                        Select a track or clip to edit
                      </div>
                    )}
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {isInspectorOpen && (
            <>
              <PanelResizeHandle className="group relative z-10 w-[4px] bg-[hsl(var(--daw-panel-border))] outline-none">
                <div className="absolute inset-y-0 -inset-x-2 cursor-col-resize transition-colors group-hover:bg-cyan-500/24 group-active:bg-cyan-500/44" />
                <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/12 opacity-80 transition-colors group-hover:bg-cyan-300" />
              </PanelResizeHandle>

              <Panel
                defaultSize={22}
                minSize={15}
                maxSize={30}
                className="flex flex-col border-l border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,hsl(var(--daw-surface-2)),hsl(var(--daw-surface-1)))]"
              >
                <div className="flex h-12 shrink-0 items-center border-b border-[hsl(var(--daw-panel-border))] bg-white/5 px-4">
                  <h2 className="daw-panel-title">Inspector</h2>
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
                                    useProjectStore
                                      .getState()
                                      .updateTrack(selectedTrack.id, {
                                        instrument: createDefaultTrackInstrument("midi", {
                                          type: getInstrumentDefinition(value).type,
                                          patchId: value,
                                        }),
                                      });
                                  }}
                                >
                                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
                                    <SelectValue placeholder="Select an instrument" />
                                  </SelectTrigger>
                                  <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
                                    {INSTRUMENT_OPTIONS.map((instrument) => (
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
                          {selectedTrack.type === "midi" ? (
                            <InstrumentParameterEditor
                              trackId={selectedTrack.id}
                              instrument={selectedTrack.instrument}
                            />
                          ) : null}
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
                          Live Input
                          <div className="h-px flex-1 bg-white/10"></div>
                        </h3>
                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,17,26,0.92),rgba(12,16,24,0.98))] shadow-[0_20px_36px_rgba(0,0,0,0.24)]">
                            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-200/90">
                                  Input Router
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-100">
                                  {inputLabel}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 font-mono text-[10px] ${selectedInputMode === "qwerty" ? "bg-amber-400/12 text-amber-200" : "bg-cyan-400/12 text-cyan-100"}`}
                              >
                                {inputModeLabel}
                              </span>
                            </div>
                            <div className="space-y-3 px-4 py-4">
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Active Source
                                </p>
                                <Select
                                  value={selectedInputId}
                                  onValueChange={setMidiInputId}
                                >
                                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
                                    <SelectValue placeholder="Select live input" />
                                  </SelectTrigger>
                                  <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
                                    {inputs.map((input) => (
                                      <SelectItem
                                        key={input.id}
                                        value={input.id}
                                        className="rounded-xl py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
                                      >
                                        {input.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Record Target
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-100">
                                    {armedMidiTrack?.name ??
                                      "No armed MIDI track"}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Browser Path
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-100">
                                    {isWebMidiSupported
                                      ? "Web MIDI + fallback"
                                      : "QWERTY fallback only"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Track Arm
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-100">
                                    {selectedTrack?.type === "midi"
                                      ? selectedTrack.recordArmed
                                        ? "Selected MIDI track is armed"
                                        : "Arm the selected MIDI track for capture"
                                      : "Select a MIDI track to arm recording"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className={`flex min-w-24 items-center justify-center rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] transition-all ${selectedTrack?.type === "midi" ? (selectedTrack.recordArmed ? "border-rose-400/50 bg-rose-500/18 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.28)]" : "border-white/10 bg-white/5 text-slate-200 hover:border-rose-400/40 hover:text-rose-100") : "border-white/10 bg-white/5 text-slate-500 opacity-60"}`}
                                  onClick={() => {
                                    if (selectedTrack?.type === "midi") {
                                      toggleTrackRecordArm(selectedTrack.id);
                                    }
                                  }}
                                  disabled={selectedTrack?.type !== "midi"}
                                >
                                  {selectedTrack?.type === "midi" &&
                                  selectedTrack.recordArmed
                                    ? "Armed"
                                    : "Arm"}
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/18 px-3 py-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Delete Track
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-100">
                                    {selectedTrack?.type === "midi"
                                      ? "Remove the selected MIDI track and its clips"
                                      : "Select a MIDI track to delete it"}
                                  </p>
                                </div>
                                <AlertDialog
                                  open={isDeleteTrackDialogOpen}
                                  onOpenChange={setIsDeleteTrackDialogOpen}
                                >
                                  <button
                                    type="button"
                                    className={`flex min-w-24 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] transition-all ${selectedTrack?.type === "midi" ? "border-red-400/40 bg-red-500/12 text-red-100 hover:border-red-300/60 hover:bg-red-500/18" : "border-white/10 bg-white/5 text-slate-500 opacity-60"}`}
                                    onClick={() => {
                                      if (selectedTrack?.type === "midi") {
                                        setIsDeleteTrackDialogOpen(true);
                                      }
                                    }}
                                    disabled={selectedTrack?.type !== "midi"}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </button>
                                  <AlertDialogContent className="max-w-md rounded-[28px] border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-xl font-semibold tracking-tight text-slate-50">
                                        Delete{" "}
                                        {selectedTrack?.name ?? "MIDI track"}?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="text-sm leading-6 text-slate-400">
                                        This removes the track, its clips, and
                                        any armed recording target on it. This
                                        action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-2xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/8 hover:text-slate-50">
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="rounded-2xl bg-red-500 text-white hover:bg-red-500/90"
                                        onClick={handleDeleteSelectedMidiTrack}
                                      >
                                        Delete Track
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>

                              <p
                                className={`text-[11px] ${supportMessage ? "text-amber-200/90" : "text-slate-400"}`}
                              >
                                {inputHint}
                              </p>
                            </div>
                          </div>
                        </div>
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
                              {[
                                "Channel EQ",
                                "Compressor",
                                "Stereo Delay",
                                "Empty",
                              ].map((slot, slotIndex) => (
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
                              {["Bus 1 Reverb", "Bus 2 Parallel Comp"].map(
                                (slot) => (
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
                                ),
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="rounded-2xl border border-amber-400/16 bg-[linear-gradient(180deg,rgba(250,204,21,0.12),rgba(217,119,6,0.08))] px-3 py-2 text-left shadow-[0_14px_28px_rgba(0,0,0,0.18)] transition-all hover:border-amber-300/30 hover:bg-amber-300/10"
                            onClick={() => {
                              openQwertyKeyboard();
                            }}
                          >
                            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-200/90">
                              QWERTY MIDI
                            </p>
                            <p className="mt-1 font-mono text-sm font-semibold text-amber-50">
                              {typeof navigator !== "undefined" &&
                              navigator.platform.toLowerCase().includes("mac")
                                ? "⌘K"
                                : "Ctrl+K"}
                            </p>
                          </button>
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
                              {selectedMidiClip?.notes.length ?? 0}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-[20px] border border-white/8 bg-black/18 px-3 py-3 transition-colors hover:bg-white/6">
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Start
                            </dt>
                            <dd className="font-mono text-xs font-semibold text-slate-200">
                              {selectedClip
                                ? formatClock(selectedClip.startTime)
                                : "00:00.00"}
                            </dd>
                          </div>
                          <div className="group flex items-center justify-between rounded-[20px] border border-white/8 bg-black/18 px-3 py-3 transition-colors hover:bg-white/6">
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Length
                            </dt>
                            <dd className="font-mono text-xs font-semibold text-slate-200">
                              {selectedClip
                                ? formatClock(selectedClip.duration)
                                : "00:00.00"}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-3 flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/18 px-3 py-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Delete Clip
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-100">
                              {selectedTrack?.type === "midi" && selectedClip
                                ? "Remove the selected MIDI clip"
                                : "Select a MIDI clip to delete it"}
                            </p>
                          </div>
                          <AlertDialog
                            open={isDeleteClipDialogOpen}
                            onOpenChange={setIsDeleteClipDialogOpen}
                          >
                            <button
                              type="button"
                              className={`flex min-w-24 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] transition-all ${selectedTrack?.type === "midi" && selectedClip ? "border-red-400/40 bg-red-500/12 text-red-100 hover:border-red-300/60 hover:bg-red-500/18" : "border-white/10 bg-white/5 text-slate-500 opacity-60"}`}
                              onClick={() => {
                                if (
                                  selectedTrack?.type === "midi" &&
                                  selectedClip
                                ) {
                                  setIsDeleteClipDialogOpen(true);
                                }
                              }}
                              disabled={
                                selectedTrack?.type !== "midi" || !selectedClip
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                            <AlertDialogContent className="max-w-md rounded-[28px] border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl font-semibold tracking-tight text-slate-50">
                                  Delete {selectedClip?.name ?? "MIDI clip"}?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-sm leading-6 text-slate-400">
                                  This removes the selected MIDI clip and its
                                  notes. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-2xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/8 hover:text-slate-50">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="rounded-2xl bg-red-500 text-white hover:bg-red-500/90"
                                  onClick={handleDeleteSelectedMidiClip}
                                >
                                  Delete Clip
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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
                                <dt className="text-xs text-slate-500">
                                  Match
                                </dt>
                                <dd className="text-right text-[11px] font-semibold text-slate-200">
                                  {selectedAafHint.matchedBy ?? "heuristic"}
                                </dd>
                              </div>
                              <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                                <dt className="text-xs text-slate-500">
                                  Entry
                                </dt>
                                <dd className="max-w-[60%] truncate text-right text-[11px] font-semibold text-slate-200">
                                  {selectedAafHint.entryPath}
                                </dd>
                              </div>
                              <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                                <dt className="text-xs text-slate-500">
                                  Start
                                </dt>
                                <dd className="text-right text-[11px] font-semibold text-slate-200">
                                  {selectedAafHint.startTime?.toFixed(3) ??
                                    "0.000"}
                                  s
                                  {selectedAafHint.startRawValue !==
                                    undefined && (
                                    <span className="ml-1 text-slate-500">
                                      ({selectedAafHint.startRawValue}{" "}
                                      {selectedAafHint.startUnit ?? "raw"})
                                    </span>
                                  )}
                                </dd>
                              </div>
                              <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                                <dt className="text-xs text-slate-500">
                                  Duration
                                </dt>
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
            </>
          )}
        </PanelGroup>
      </div>

      <div className="z-20 shrink-0 border-t border-[hsl(var(--daw-panel-border))] bg-[linear-gradient(180deg,rgba(11,17,28,0.96),rgba(9,13,22,0.98))] shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        <TransportBar
          duration={currentProject.duration}
          inputLabel={inputLabel}
          inputModeLabel={inputModeLabel}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          recordEnabled={Boolean(armedMidiTrack) || isRecording}
          supportMessage={inputHint}
        />
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

      <QwertyMidiKeyboardDialog
        activeKeys={pressedQwertyKeys}
        armedTrackName={armedMidiTrack?.name ?? null}
        open={isQwertyKeyboardOpen}
        onNoteEnd={releaseQwertyKey}
        onNoteStart={pressQwertyKey}
        onOpenChange={setIsQwertyKeyboardOpen}
      />
    </div>
  );
};

export default ProjectPage;
