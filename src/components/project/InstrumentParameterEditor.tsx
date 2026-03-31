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
    <div className="space-y-3 rounded-[22px] border border-white/8 bg-black/18 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {definition.ui?.category ?? definition.engineType}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-300/90">
            {definition.ui?.description ?? "Shape the instrument response for playback, live input, and export."}
          </p>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          {definition.engineType}
        </div>
      </div>

      <div className="rounded-2xl border border-white/7 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Preset
          </span>
          <span className="font-mono text-[11px] text-slate-300/80">
            {customPresets.length} custom
          </span>
        </div>
        <div className="space-y-3">
          <Select value={selectedPresetId} onValueChange={applyPreset}>
            <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
              <SelectValue placeholder="Choose a preset" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
              {presetOptions.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  className="rounded-xl py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
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
              placeholder="Save current settings as..."
              className="h-10 rounded-2xl border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-300/70"
              maxLength={48}
            />
            <Button
              type="button"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className="h-10 rounded-2xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(25,197,255,0.22),rgba(14,165,233,0.12))] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50 hover:bg-[linear-gradient(135deg,rgba(25,197,255,0.28),rgba(14,165,233,0.18))]"
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      {definition.engineType === "drum-sampler" && definition.zones?.length ? (
        <div className="rounded-2xl border border-white/7 bg-white/[0.03] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Note Map
            </span>
            <span className="font-mono text-[11px] text-slate-300/80">
              {definition.zones.length} zones
            </span>
          </div>
          <div className="space-y-2">
            {definition.zones.map((zone) => (
              <div
                key={`${zone.url}:${zone.pitch}:${zone.minPitch ?? zone.pitch}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/6 bg-black/18 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {zone.label ?? getMidiNoteLabel(zone.pitch)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {getZoneRangeLabel(zone)}
                  </div>
                </div>
                <div className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-cyan-100">
                  {getMidiNoteLabel(zone.pitch)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {parameterSchema.map((parameter) => {
          const value = getParameterValue(definition, instrument, parameter);

          return (
            <div
              key={parameter.id}
              className="rounded-2xl border border-white/7 bg-white/[0.03] px-3 py-3"
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
                  <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-white/5 text-left text-slate-100 focus:ring-cyan-300/70 focus:ring-offset-0">
                    <SelectValue placeholder={`Select ${parameter.label}`} />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[hsl(var(--daw-surface-2))] text-slate-100">
                    {parameter.options?.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="rounded-xl py-2 pl-8 pr-3 text-sm focus:bg-white/8 focus:text-cyan-50"
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