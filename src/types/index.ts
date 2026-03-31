export type InstrumentType = "oscillator" | "sampler" | "wasm-synth";

export interface InstrumentConfig {
  type: InstrumentType;
  patchId?: string;
  parameters: Record<string, number | string>;
}

export interface MidiNote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export type LiveInputMode = "web-midi" | "qwerty";

export interface LiveMidiMessage {
  type: "noteon" | "noteoff";
  pitch: number;
  velocity: number;
  channel: number;
  sourceId: string;
  timestamp: number;
  inputMode: LiveInputMode;
}

export type ProjectTool = "pointer" | "split" | "trim";

export interface MidiClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  notes: MidiNote[];
  audioData?: ArrayBuffer;
  audioAssetPath?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioOffset?: number;
  sourceDuration?: number;
  waveformData?: number[];
  sourceFile?: string;
  sourceTrackIndex?: number;
  sourceChannel?: number;
}

export type AudioClip = MidiClip;

export interface ProjectTrack {
  id: string;
  name: string;
  type: "midi" | "audio";
  clips: MidiClip[];
  trackColor?: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  recordArmed?: boolean;
  instrument: InstrumentConfig;
}

export type AudioTrack = ProjectTrack;
export type MidiTrack = ProjectTrack;

export interface AafImportRateInfo {
  entryPath: string;
  kind: "edit-rate" | "sample-rate";
  value: number;
  label: string;
}

export interface AafImportDebugHint {
  entryPath: string;
  trackName?: string;
  slotId?: number;
  matchedAudioEntryName?: string;
  matchedBy?: string;
  startRawValue?: number;
  startUnit?: string;
  startTime?: number;
  durationRawValue?: number;
  durationUnit?: string;
  duration?: number;
  rate?: number;
  rateKind?: "edit-rate" | "sample-rate";
}

export interface ProjectImportMetadata {
  sourceFormat: "aaf" | "dawproject";
  importedAt: number;
  summary?: string;
  aafRates?: AafImportRateInfo[];
  aafHints?: AafImportDebugHint[];
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  duration: number;
  tracks: ProjectTrack[];
  createdAt: number;
  lastModified: number;
  importMetadata?: ProjectImportMetadata;
}

export interface ProjectSummary {
  id: string;
  name: string;
  bpm: number;
  duration: number;
  trackCount: number;
  createdAt: number;
  lastModified: number;
}

export interface ImportedMidiProject {
  bpm: number;
  duration: number;
  tracks: ProjectTrack[];
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  recordingTrackId: string | null;
  recordingClipId: string | null;
  recordingStartTime: number | null;
  activeInputId: string | null;
  inputMode: LiveInputMode;
  currentTime: number;
  isLoopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  masterVolume: number;
  isMasterMuted: boolean;
  revision: number;
}
