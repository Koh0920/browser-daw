export type InstrumentType = "oscillator" | "sampler" | "wasm-synth"

export interface InstrumentConfig {
  type: InstrumentType
  patchId?: string
  parameters: Record<string, number | string>
}

export interface MidiNote {
  id: string
  pitch: number
  startTime: number
  duration: number
  velocity: number
}

export interface MidiClip {
  id: string
  name: string
  startTime: number
  duration: number
  notes: MidiNote[]
  sourceFile?: string
  sourceTrackIndex?: number
  sourceChannel?: number
}

export interface ProjectTrack {
  id: string
  name: string
  type: "midi" | "audio"
  clips: MidiClip[]
  volume: number
  pan: number
  muted: boolean
  solo: boolean
  instrument: InstrumentConfig
}

export interface Project {
  id: string
  name: string
  bpm: number
  duration: number
  tracks: ProjectTrack[]
  createdAt: number
  lastModified: number
}

export interface ProjectSummary {
  id: string
  name: string
  bpm: number
  duration: number
  trackCount: number
  createdAt: number
  lastModified: number
}

export interface ImportedMidiProject {
  bpm: number
  duration: number
  tracks: ProjectTrack[]
}

export interface TransportState {
  isPlaying: boolean
  currentTime: number
  isLoopEnabled: boolean
  loopStart: number
  loopEnd: number
  revision: number
}