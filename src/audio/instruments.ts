import type { InstrumentType } from "@/types";

export interface SampleZone {
  pitch: number;
  url: string;
}

export interface InstrumentDefinition {
  id: string;
  name: string;
  type: InstrumentType;
  zones?: SampleZone[];
  pitchTracking?: boolean;
}

export const INSTRUMENTS: Record<string, InstrumentDefinition> = {
  "basic-synth": {
    id: "basic-synth",
    name: "Basic Synth",
    type: "oscillator",
  },
  piano: {
    id: "piano",
    name: "Acoustic Grand Piano",
    type: "sampler",
    pitchTracking: true,
    zones: [
      { pitch: 36, url: "/samples/piano-c2.mp3" },
      { pitch: 48, url: "/samples/piano-c3.mp3" },
      { pitch: 60, url: "/samples/piano-c4.mp3" },
      { pitch: 72, url: "/samples/piano-c5.mp3" },
      { pitch: 84, url: "/samples/piano-c6.mp3" },
    ],
  },
};

export const getInstrumentDefinition = (patchId?: string) => {
  if (patchId && INSTRUMENTS[patchId]) {
    return INSTRUMENTS[patchId];
  }

  return INSTRUMENTS["basic-synth"];
};

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