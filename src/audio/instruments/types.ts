import type { InstrumentConfig, InstrumentType } from "@/types";

export type InstrumentParameterValue = number | string | boolean;
export type InstrumentEngineType = InstrumentType | "drum-sampler";

export interface SampleZone {
  pitch: number;
  url: string;
  label?: string;
  minPitch?: number;
  maxPitch?: number;
  minVelocity?: number;
  maxVelocity?: number;
  rootNote?: number;
  tuneCents?: number;
  releaseSeconds?: number;
  preload?: boolean;
}

export interface InstrumentUiMetadata {
  category?: string;
  description?: string;
  tags?: string[];
}

export interface InstrumentParameterOption {
  label: string;
  value: string;
}

export interface InstrumentParameterDefinition {
  id: string;
  label: string;
  kind: "slider" | "select";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: InstrumentParameterOption[];
}

export interface InstrumentDefinition {
  id: string;
  name: string;
  type: InstrumentType;
  engineType: InstrumentEngineType;
  defaultParameters?: Record<string, InstrumentParameterValue>;
  parameterSchema?: InstrumentParameterDefinition[];
  zones?: SampleZone[];
  pitchTracking?: boolean;
  oneShot?: boolean;
  preloadStrategy?: "eager" | "lazy";
  ui?: InstrumentUiMetadata;
}

export interface VoicePlanningNote {
  pitch: number;
  velocity: number;
  duration: number;
}

export interface InstrumentVoicePlanningContext {
  instrument: InstrumentConfig;
  note: VoicePlanningNote;
}

export interface InstrumentVoicePlan {
  instrumentId: string;
  engineType: InstrumentEngineType;
  instrumentDefinition: InstrumentDefinition;
  oscillatorType: OscillatorType;
  normalizedVelocity: number;
  playbackRate: number;
  gain: number;
  oneShot: boolean;
  zone: SampleZone | null;
  attackSeconds?: number;
  decaySeconds?: number;
  releaseSeconds?: number;
  sustainLevel?: number;
}

export interface InstrumentVoicePlanner {
  planVoice: (
    context: InstrumentVoicePlanningContext,
  ) => InstrumentVoicePlan;
}

export interface AudioAssetSource {
  getArrayBuffer: (assetId: string) => Promise<ArrayBuffer | null>;
}

export interface AudioBufferDecoder {
  decode: (
    context: BaseAudioContext,
    audioData: ArrayBuffer,
  ) => Promise<AudioBuffer | null>;
}