import { getInstrumentParameterDefaults } from "@/audio/instruments";
import type { InstrumentConfig } from "@/types";

const STORAGE_KEY = "browser-daw.instrument-presets.v1";

export interface StoredInstrumentPreset {
  id: string;
  patchId: string;
  name: string;
  parameters: InstrumentConfig["parameters"];
  createdAt: number;
  updatedAt: number;
}

type InstrumentPresetMap = Record<string, StoredInstrumentPreset[]>;

const canUseStorage = () => {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
};

const readPresetMap = (): InstrumentPresetMap => {
  if (!canUseStorage()) {
    return {};
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return typeof parsedValue === "object" && parsedValue ? parsedValue as InstrumentPresetMap : {};
  } catch {
    return {};
  }
};

const writePresetMap = (presetMap: InstrumentPresetMap) => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presetMap));
};

const sanitizePresetName = (value: string) => value.trim().slice(0, 48);

export const listInstrumentPresets = (patchId?: string) => {
  if (!patchId) {
    return [];
  }

  const presetMap = readPresetMap();
  return [...(presetMap[patchId] ?? [])].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
};

export const buildFactoryInstrumentPreset = (patchId?: string) => {
  const resolvedPatchId = patchId ?? "basic-synth";
  return {
    id: `factory:${resolvedPatchId}`,
    patchId: resolvedPatchId,
    name: "Factory Default",
    parameters: getInstrumentParameterDefaults(resolvedPatchId),
  };
};

export const saveInstrumentPreset = (
  patchId: string | undefined,
  name: string,
  parameters: InstrumentConfig["parameters"],
) => {
  const resolvedPatchId = patchId ?? "basic-synth";
  const sanitizedName = sanitizePresetName(name);
  if (!sanitizedName) {
    return null;
  }

  const presetMap = readPresetMap();
  const currentPresets = presetMap[resolvedPatchId] ?? [];
  const existingPreset = currentPresets.find(
    (preset) => preset.name.toLowerCase() === sanitizedName.toLowerCase(),
  );
  const timestamp = Date.now();

  const nextPreset: StoredInstrumentPreset = existingPreset
    ? {
        ...existingPreset,
        name: sanitizedName,
        parameters: { ...parameters },
        updatedAt: timestamp,
      }
    : {
        id: crypto.randomUUID(),
        patchId: resolvedPatchId,
        name: sanitizedName,
        parameters: { ...parameters },
        createdAt: timestamp,
        updatedAt: timestamp,
      };

  presetMap[resolvedPatchId] = existingPreset
    ? currentPresets.map((preset) =>
        preset.id === nextPreset.id ? nextPreset : preset,
      )
    : [...currentPresets, nextPreset];
  writePresetMap(presetMap);
  return nextPreset;
};