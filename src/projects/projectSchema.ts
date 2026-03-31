import {
  getInstrumentParameterDefaults,
  resolveInstrumentPatchId,
} from "@/audio/instruments";
import type {
  AudioClip,
  AudioTrack,
  InstrumentConfig,
  InstrumentType,
  MidiClip,
  MidiTrack,
  Project,
  ProjectTrack,
} from "@/types";

export const PROJECT_SCHEMA_VERSION = 1;

type TrackType = ProjectTrack["type"];

const DEFAULT_TRACK_PATCH_BY_TYPE: Record<TrackType, Partial<Record<InstrumentType, string>>> = {
  audio: {},
  midi: {
    oscillator: "basic-synth",
    sampler: "piano",
  },
};

const normalizeInstrumentParameters = (
  patchId: string | undefined,
  parameters?: InstrumentConfig["parameters"],
) => {
  return {
    ...getInstrumentParameterDefaults(patchId),
    ...(parameters ?? {}),
  };
};

export const createDefaultTrackInstrument = (
  trackType: TrackType,
  instrument?: Partial<InstrumentConfig>,
): InstrumentConfig => {
  const normalizedType =
    trackType === "audio" ? "sampler" : instrument?.type ?? "oscillator";
  const defaultPatchId = DEFAULT_TRACK_PATCH_BY_TYPE[trackType][normalizedType];
  const normalizedPatchId =
    resolveInstrumentPatchId(instrument?.patchId) ?? defaultPatchId;

  return {
    type: normalizedType,
    patchId: normalizedPatchId,
    parameters: normalizeInstrumentParameters(
      normalizedPatchId,
      instrument?.parameters,
    ),
  };
};

const migrateAudioClip = (clip: AudioClip): AudioClip => ({
  ...clip,
  clipType: "audio",
  audioOffset: clip.audioOffset ?? 0,
  sourceDuration: clip.sourceDuration ?? clip.duration,
});

const migrateMidiClip = (clip: MidiClip): MidiClip => ({
  ...clip,
  clipType: "midi",
  notes: clip.notes ?? [],
});

const migrateTrack = (track: ProjectTrack): ProjectTrack => {
  if (track.type === "audio") {
    return {
      ...track,
      recordArmed: track.recordArmed ?? false,
      instrument: createDefaultTrackInstrument("audio", track.instrument),
      clips: track.clips.map(migrateAudioClip),
    } satisfies AudioTrack;
  }

  return {
    ...track,
    recordArmed: track.recordArmed ?? false,
    instrument: createDefaultTrackInstrument("midi", track.instrument),
    clips: track.clips.map(migrateMidiClip),
  } satisfies MidiTrack;
};

export const migrateProjectSchema = (project: Project): Project => ({
  ...project,
  projectSchemaVersion: PROJECT_SCHEMA_VERSION,
  timeSignatureNumerator: project.timeSignatureNumerator ?? 4,
  timeSignatureDenominator: project.timeSignatureDenominator ?? 4,
  tracks: project.tracks.map(migrateTrack),
});