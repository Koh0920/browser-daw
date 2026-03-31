import type { InstrumentType } from "@/types";
import type {
  InstrumentDefinition,
  InstrumentParameterValue,
  SampleZone,
} from "@/audio/instruments/types";

const OSCILLATOR_OPTIONS = [
  { label: "Triangle", value: "triangle" },
  { label: "Saw", value: "sawtooth" },
  { label: "Square", value: "square" },
  { label: "Sine", value: "sine" },
] as const;

const ADSR_PARAMETER_SCHEMA = [
  {
    id: "gain",
    label: "Gain",
    kind: "slider",
    min: 0.2,
    max: 1.5,
    step: 0.01,
    unit: "x",
  },
  {
    id: "attackSeconds",
    label: "Attack",
    kind: "slider",
    min: 0,
    max: 0.4,
    step: 0.001,
    unit: "s",
  },
  {
    id: "decaySeconds",
    label: "Decay",
    kind: "slider",
    min: 0,
    max: 1.2,
    step: 0.005,
    unit: "s",
  },
  {
    id: "sustainLevel",
    label: "Sustain",
    kind: "slider",
    min: 0,
    max: 1,
    step: 0.01,
    unit: "%",
  },
  {
    id: "releaseSeconds",
    label: "Release",
    kind: "slider",
    min: 0.02,
    max: 2.5,
    step: 0.01,
    unit: "s",
  },
] as const;

const DRUM_PARAMETER_SCHEMA = [
  ADSR_PARAMETER_SCHEMA[0],
  ADSR_PARAMETER_SCHEMA[1],
  ADSR_PARAMETER_SCHEMA[2],
  ADSR_PARAMETER_SCHEMA[4],
] as const;

const pickParameterValue = (
  value: InstrumentParameterValue | undefined,
): number | string | undefined => {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return undefined;
};

class InstrumentRegistry {
  private readonly instruments: Record<string, InstrumentDefinition>;

  constructor(definitions: InstrumentDefinition[]) {
    this.instruments = Object.fromEntries(
      definitions.map((definition) => [definition.id, definition]),
    );
  }

  get(patchId?: string) {
    const resolvedPatchId = resolveInstrumentPatchId(patchId);
    if (resolvedPatchId && this.instruments[resolvedPatchId]) {
      return this.instruments[resolvedPatchId];
    }

    return this.instruments["basic-synth"];
  }

  list() {
    return Object.values(this.instruments);
  }
}

const INSTRUMENT_ALIASES: Record<string, string> = {
  "basic synth": "basic-synth",
  "acoustic grand piano": "piano",
  "drum kit": "drum-kit",
};

export const INSTRUMENTS: Record<string, InstrumentDefinition> = {
  "basic-synth": {
    id: "basic-synth",
    name: "Basic Synth",
    type: "oscillator",
    engineType: "oscillator",
    defaultParameters: {
      gain: 1,
      oscType: "triangle",
      attackSeconds: 0.01,
      decaySeconds: 0.04,
      sustainLevel: 0.8,
      releaseSeconds: 0.08,
    },
    parameterSchema: [
      ADSR_PARAMETER_SCHEMA[0],
      {
        id: "oscType",
        label: "Waveform",
        kind: "select",
        options: [...OSCILLATOR_OPTIONS],
      },
      ADSR_PARAMETER_SCHEMA[1],
      ADSR_PARAMETER_SCHEMA[2],
      ADSR_PARAMETER_SCHEMA[3],
      ADSR_PARAMETER_SCHEMA[4],
    ],
    ui: {
      category: "Synth",
      description: "Playable oscillator with a compact envelope.",
    },
  },
  piano: {
    id: "piano",
    name: "Acoustic Grand Piano",
    type: "sampler",
    engineType: "sampler",
    defaultParameters: {
      gain: 1,
      attackSeconds: 0.004,
      decaySeconds: 0.12,
      sustainLevel: 0.72,
      releaseSeconds: 1.35,
    },
    parameterSchema: [...ADSR_PARAMETER_SCHEMA],
    preloadStrategy: "eager",
    pitchTracking: true,
    ui: {
      category: "Sampler",
      description: "Multi-zone piano with pitch tracking across five roots.",
    },
    zones: [
      { label: "C2", pitch: 36, rootNote: 36, minPitch: 0, maxPitch: 41, url: "/samples/piano-c2.mp3" },
      { label: "C3", pitch: 48, rootNote: 48, minPitch: 42, maxPitch: 53, url: "/samples/piano-c3.mp3" },
      { label: "C4", pitch: 60, rootNote: 60, minPitch: 54, maxPitch: 65, url: "/samples/piano-c4.mp3" },
      { label: "C5", pitch: 72, rootNote: 72, minPitch: 66, maxPitch: 77, url: "/samples/piano-c5.mp3" },
      { label: "C6", pitch: 84, rootNote: 84, minPitch: 78, maxPitch: 127, url: "/samples/piano-c6.mp3" },
    ],
  },
  "drum-kit": {
    id: "drum-kit",
    name: "Drum Kit",
    type: "sampler",
    engineType: "drum-sampler",
    defaultParameters: {
      gain: 1,
      attackSeconds: 0.002,
      decaySeconds: 0.05,
      sustainLevel: 0.45,
      releaseSeconds: 0.18,
    },
    parameterSchema: [...DRUM_PARAMETER_SCHEMA],
    preloadStrategy: "eager",
    pitchTracking: false,
    oneShot: true,
    ui: {
      category: "Drum Sampler",
      description: "One-shot drum engine with per-hit zone mapping.",
    },
    zones: [
      { label: "Kick", pitch: 36, rootNote: 36, minPitch: 36, maxPitch: 36, url: "/samples/drums/kick-c2.mp3" },
      { label: "Snare", pitch: 38, rootNote: 38, minPitch: 38, maxPitch: 40, url: "/samples/drums/snare-d2.mp3" },
      { label: "Closed Hat", pitch: 41, rootNote: 41, minPitch: 41, maxPitch: 41, url: "/samples/drums/hat-f2.mp3" },
      { label: "Pedal Hat", pitch: 42, rootNote: 42, minPitch: 42, maxPitch: 45, url: "/samples/drums/hat-f2.mp3" },
      { label: "Open Hat", pitch: 46, rootNote: 46, minPitch: 46, maxPitch: 46, url: "/samples/drums/hat-f2.mp3" },
    ],
  },
};

const defaultInstrumentRegistry = new InstrumentRegistry(
  Object.values(INSTRUMENTS),
);

export const resolveInstrumentPatchId = (patchId?: string) => {
  if (!patchId) {
    return undefined;
  }

  if (INSTRUMENTS[patchId]) {
    return patchId;
  }

  return INSTRUMENT_ALIASES[patchId.trim().toLowerCase()] ?? undefined;
};

export const getInstrumentDefinition = (patchId?: string) => {
  return defaultInstrumentRegistry.get(patchId);
};

export const listInstrumentDefinitions = () => defaultInstrumentRegistry.list();

export const getInstrumentParameterDefaults = (patchId?: string) => {
  const definition = getInstrumentDefinition(patchId);
  const defaults = definition.defaultParameters ?? {};

  return Object.fromEntries(
    Object.entries(defaults)
      .map(([key, value]) => [key, pickParameterValue(value)])
      .filter((entry): entry is [string, number | string] => entry[1] !== undefined),
  );
};

export type { InstrumentDefinition, SampleZone } from "@/audio/instruments/types";

export const findNearestSampleZone = (
  notePitch: number,
  zones: SampleZone[],
) => {
  return zones.reduce((nearestZone, candidateZone) => {
    const nearestDistance = Math.abs(notePitch - nearestZone.pitch);
    const candidateDistance = Math.abs(notePitch - candidateZone.pitch);
    return candidateDistance < nearestDistance ? candidateZone : nearestZone;
  }, zones[0]);
};

export const findSampleZoneForNote = (
  notePitch: number,
  velocity: number,
  zones: SampleZone[],
) => {
  const rangedZones = zones.filter((zone) => {
    const minPitch = zone.minPitch ?? zone.pitch;
    const maxPitch = zone.maxPitch ?? zone.pitch;
    const minVelocity = zone.minVelocity ?? 0;
    const maxVelocity = zone.maxVelocity ?? 127;

    return (
      notePitch >= minPitch &&
      notePitch <= maxPitch &&
      velocity >= minVelocity &&
      velocity <= maxVelocity
    );
  });

  const candidateZones = rangedZones.length > 0 ? rangedZones : zones;
  return candidateZones.reduce((nearestZone, candidateZone) => {
    const nearestRoot = nearestZone.rootNote ?? nearestZone.pitch;
    const candidateRoot = candidateZone.rootNote ?? candidateZone.pitch;
    const nearestDistance = Math.abs(notePitch - nearestRoot);
    const candidateDistance = Math.abs(notePitch - candidateRoot);
    return candidateDistance < nearestDistance ? candidateZone : nearestZone;
  }, candidateZones[0]);
};
