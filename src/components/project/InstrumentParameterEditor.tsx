import { useEffect, useMemo, useState } from "react";
import {
  buildFactoryInstrumentPreset,
  listInstrumentPresets,
  saveInstrumentPreset,
  type StoredInstrumentPreset,
} from "@/audio/instrumentPresets";
import {
  getInstrumentDefinition,
  getInstrumentParameterDefaults,
  type InstrumentDefinition,
} from "@/audio/instruments";
import type {
  InstrumentParameterDefinition,
  SampleZone,
} from "@/audio/instruments/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useProjectStore } from "@/stores/projectStore";
import type { InstrumentConfig } from "@/types";

interface InstrumentParameterEditorProps {
  trackId: string;
  instrument: InstrumentConfig;
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const getMidiNoteLabel = (pitch: number) => {
  const noteName = NOTE_NAMES[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${noteName}${octave}`;
};

const formatParameterValue = (
  definition: InstrumentParameterDefinition,
  value: number | string,
) => {
  if (typeof value === "string") {
    const option = definition.options?.find((candidate) => candidate.value === value);
    return option?.label ?? value;
  }

  if (definition.unit === "%") {
    return `${Math.round(value * 100)}%`;
  }

  if (definition.unit === "s") {
    return `${value.toFixed(3)}s`;
  }

  if (definition.unit === "x") {
    return `${value.toFixed(2)}x`;
  }

  return value.toFixed(2);
};

const getParameterValue = (
  definition: InstrumentDefinition,
  instrument: InstrumentConfig,
  parameter: InstrumentParameterDefinition,
) => {
  const configuredValue = instrument.parameters[parameter.id];
  if (typeof configuredValue === "number" || typeof configuredValue === "string") {
    return configuredValue;
  }

  const defaultValue = definition.defaultParameters?.[parameter.id];
  if (typeof defaultValue === "number" || typeof defaultValue === "string") {
    return defaultValue;
  }

  if (parameter.kind === "select") {
    return parameter.options?.[0]?.value ?? "";
  }

  return parameter.min ?? 0;
};

const getZoneRangeLabel = (zone: SampleZone) => {
  const minPitch = zone.minPitch ?? zone.pitch;
  const maxPitch = zone.maxPitch ?? zone.pitch;

  if (minPitch === maxPitch) {
    return getMidiNoteLabel(minPitch);
  }

  return `${getMidiNoteLabel(minPitch)}-${getMidiNoteLabel(maxPitch)}`;
};

export default function InstrumentParameterEditor({
  instrument,
  trackId,
}: InstrumentParameterEditorProps) {
  const definition = getInstrumentDefinition(instrument.patchId);
  const parameterSchema = definition.parameterSchema ?? [];
  const [presetName, setPresetName] = useState("");
  const [presetsVersion, setPresetsVersion] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState(
    buildFactoryInstrumentPreset(instrument.patchId).id,
  );
  const customPresets = useMemo(
    () => listInstrumentPresets(instrument.patchId),
    [instrument.patchId, presetsVersion],
  );
  const presetOptions = useMemo(() => {
    const factoryPreset = buildFactoryInstrumentPreset(instrument.patchId);
    return [factoryPreset, ...customPresets];
  }, [customPresets, instrument.patchId]);

  useEffect(() => {
    setSelectedPresetId(buildFactoryInstrumentPreset(instrument.patchId).id);
    setPresetName("");
  }, [instrument.patchId]);

  if (parameterSchema.length === 0) {
    return null;
  }

  const updateTrackInstrument = (nextParameters: InstrumentConfig["parameters"]) => {
    useProjectStore.getState().updateTrack(trackId, {
      instrument: {
        ...instrument,
        parameters: nextParameters,
      },
    });
  };

  const updateInstrumentParameter = (parameterId: string, value: number | string) => {
    updateTrackInstrument({
      ...instrument.parameters,
      [parameterId]: value,
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = presetOptions.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }

    setSelectedPresetId(presetId);
    updateTrackInstrument({
      ...getInstrumentParameterDefaults(instrument.patchId),
      ...preset.parameters,
    });
  };

  const handleSavePreset = () => {
    const preset = saveInstrumentPreset(
      instrument.patchId,
      presetName,
      instrument.parameters,
    );

    if (!preset) {
      return;
    }

    setPresetName(preset.name);
    setPresetsVersion((version) => version + 1);
    setSelectedPresetId(preset.id);
  };

  return (
    <div className="space-y-2 border-t border-white/8 pt-2">
      {/* Description */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] text-slate-400/80">
          {definition.ui?.description ?? "Shape the instrument response for playback, live input, and export."}
        </p>
        <span className="shrink-0 rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200">
          {definition.ui?.category ?? definition.engineType}
        </span>
      </div>

      {/* Preset */}
      <div className="border border-white/8 bg-white/3 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Preset
          </span>
          <span className="font-mono text-[10px] text-slate-500">
            {customPresets.length} custom
          </span>
        </div>
        <div className="space-y-2">
          <Select value={selectedPresetId} onValueChange={applyPreset}>
            <SelectTrigger className="h-8 rounded border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
              <SelectValue placeholder="Choose a preset" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
              {presetOptions.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  className="rounded py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
                >
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Save current as..."
              className="h-8 rounded border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-300/70"
              maxLength={48}
            />
            <Button
              type="button"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className="h-8 rounded border border-cyan-300/20 bg-cyan-500/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50 hover:bg-cyan-500/22 disabled:opacity-40"
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Note Map */}
      {definition.engineType === "drum-sampler" && definition.zones?.length ? (
        <div className="border border-white/8 bg-white/3 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Note Map
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {definition.zones.length} zones
            </span>
          </div>
          <div className="space-y-1">
            {definition.zones.map((zone) => (
              <div
                key={`${zone.url}:${zone.pitch}:${zone.minPitch ?? zone.pitch}`}
                className="flex items-center justify-between border border-white/8 bg-white/3 px-3 py-1.5"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-100">
                    {zone.label ?? getMidiNoteLabel(zone.pitch)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {getZoneRangeLabel(zone)}
                  </p>
                </div>
                <span className="rounded border border-white/8 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-100">
                  {getMidiNoteLabel(zone.pitch)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Parameters */}
      <div className="space-y-1">
        {parameterSchema.map((parameter) => {
          const value = getParameterValue(definition, instrument, parameter);

          return (
            <div
              key={parameter.id}
              className="border border-white/8 bg-white/3 px-3 py-2"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {parameter.label}
                </span>
                <span className="font-mono text-xs font-semibold text-cyan-100">
                  {formatParameterValue(parameter, value)}
                </span>
              </div>

              {parameter.kind === "slider" && typeof value === "number" ? (
                <Slider
                  value={[value]}
                  min={parameter.min ?? 0}
                  max={parameter.max ?? 1}
                  step={parameter.step ?? 0.01}
                  onValueChange={(nextValue) => {
                    const resolvedValue = nextValue[0];
                    if (typeof resolvedValue === "number") {
                      updateInstrumentParameter(parameter.id, resolvedValue);
                    }
                  }}
                  aria-label={`${definition.name} ${parameter.label}`}
                  className="w-full"
                />
              ) : null}

              {parameter.kind === "select" && typeof value === "string" ? (
                <Select
                  value={value}
                  onValueChange={(nextValue) => {
                    updateInstrumentParameter(parameter.id, nextValue);
                  }}
                >
                  <SelectTrigger className="h-8 rounded border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
                    <SelectValue placeholder={`Select ${parameter.label}`} />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
                    {parameter.options?.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="rounded py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
