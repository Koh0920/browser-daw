import {
  findSampleZoneForNote,
  getInstrumentDefinition,
} from "@/audio/instruments";
import { getNormalizedVelocity, SAMPLER_RELEASE_SECONDS } from "@/audio/engine/shared";
import type { InstrumentVoicePlan, VoicePlanningNote } from "@/audio/instruments/types";
import type { InstrumentConfig } from "@/types";

export type VoiceRenderMode = "timeline" | "offline" | "live";

interface PlanInstrumentVoiceArgs {
  instrument: InstrumentConfig;
  note: VoicePlanningNote;
  mode: VoiceRenderMode;
}

const resolveOscillatorType = (instrument: InstrumentConfig): OscillatorType => {
  return typeof instrument.parameters.oscType === "string"
    ? (instrument.parameters.oscType as OscillatorType)
    : "triangle";
};

const getNumericParameter = (
  instrument: InstrumentConfig,
  name: string,
  fallback: number,
) => {
  const value = instrument.parameters[name];
  return typeof value === "number" ? value : fallback;
};

const getDefinitionNumericDefault = (
  instrumentDefinition: ReturnType<typeof getInstrumentDefinition>,
  name: string,
  fallback: number,
) => {
  const value = instrumentDefinition.defaultParameters?.[name];
  return typeof value === "number" ? value : fallback;
};

const resolveReleaseSeconds = (
  voicePlanMode: VoiceRenderMode,
  isSamplerVoice: boolean,
  isOneShot: boolean,
) => {
  if (!isSamplerVoice) {
    return 0.08;
  }

  if (voicePlanMode === "live") {
    return isOneShot ? 0.18 : 0.32;
  }

  return isOneShot ? 0.45 : SAMPLER_RELEASE_SECONDS;
};

export const planInstrumentVoice = ({
  instrument,
  note,
  mode,
}: PlanInstrumentVoiceArgs): InstrumentVoicePlan => {
  const instrumentDefinition = getInstrumentDefinition(instrument.patchId);
  const zone =
    instrumentDefinition.type === "sampler" && instrumentDefinition.zones?.length
      ? findSampleZoneForNote(
          note.pitch,
          note.velocity,
          instrumentDefinition.zones,
        )
      : null;
  const normalizedVelocity = getNormalizedVelocity(note.velocity);
  const isSamplerVoice = Boolean(zone);
  const rootNote = zone?.rootNote ?? zone?.pitch ?? note.pitch;
  const tuneCents = zone?.tuneCents ?? 0;
  const playbackRate =
    zone && instrumentDefinition.pitchTracking !== false
      ? Math.pow(2, (note.pitch - rootNote + tuneCents / 100) / 12)
      : 1;
  const defaultAttackSeconds = isSamplerVoice
    ? instrumentDefinition.oneShot
      ? 0.002
      : 0.004
    : 0.01;
  const defaultDecaySeconds = isSamplerVoice ? 0.08 : 0.04;
  const defaultSustainLevel = isSamplerVoice ? 0.72 : 0.8;
  const attackSeconds = getNumericParameter(
    instrument,
    "attackSeconds",
    getDefinitionNumericDefault(
      instrumentDefinition,
      "attackSeconds",
      defaultAttackSeconds,
    ),
  );
  const decaySeconds = getNumericParameter(
    instrument,
    "decaySeconds",
    getDefinitionNumericDefault(
      instrumentDefinition,
      "decaySeconds",
      defaultDecaySeconds,
    ),
  );
  const sustainLevel = getNumericParameter(
    instrument,
    "sustainLevel",
    getDefinitionNumericDefault(
      instrumentDefinition,
      "sustainLevel",
      defaultSustainLevel,
    ),
  );
  const releaseSeconds = getNumericParameter(
    instrument,
    "releaseSeconds",
    zone?.releaseSeconds ??
      resolveReleaseSeconds(
        mode,
        isSamplerVoice,
        Boolean(instrumentDefinition.oneShot),
      ),
  );
  const outputGain = getNumericParameter(
    instrument,
    "gain",
    getDefinitionNumericDefault(instrumentDefinition, "gain", 1),
  );

  return {
    instrumentId: instrumentDefinition.id,
    engineType: instrumentDefinition.engineType,
    instrumentDefinition,
    oscillatorType: resolveOscillatorType(instrument),
    normalizedVelocity,
    playbackRate,
    gain: normalizedVelocity * outputGain,
    oneShot: Boolean(instrumentDefinition.oneShot),
    zone,
    attackSeconds,
    decaySeconds,
    releaseSeconds,
    sustainLevel,
  };
};