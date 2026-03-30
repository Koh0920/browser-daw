"use client";

import { useCallback } from "react";
import {
  findNearestSampleZone,
  getInstrumentDefinition,
} from "@/audio/instruments";
import { useToast } from "@/components/ui/use-toast";
import type { MidiClip, MidiNote, Project, ProjectTrack } from "@/types";

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHANNELS = 2;
const MIN_RENDER_DURATION_SECONDS = 0.05;
const MIN_NOTE_DURATION_SECONDS = 0.05;
const SAMPLER_RELEASE_SECONDS = 1.35;

export interface ExportOptions {
  mode: "master" | "stems";
  useLoopRange: boolean;
  loopStart?: number;
  loopEnd?: number;
}

type ExportRangeOptions = Omit<ExportOptions, "mode">;

interface RenderRange {
  start: number;
  end: number;
  duration: number;
}

interface ExportRenderState {
  instrumentBufferCache: Map<string, Promise<AudioBuffer | null>>;
}

const midiNoteToFrequency = (note: number) =>
  440 * Math.pow(2, (note - 69) / 12);

const getNormalizedVelocity = (velocity: number) => {
  const normalized = Math.min(1, Math.max(0.08, velocity / 127));
  return Math.pow(normalized, 0.72);
};

const instrumentSampleDataCache = new Map<string, Promise<ArrayBuffer | null>>();

const loadInstrumentSampleData = async (url: string) => {
  const cachedBuffer = instrumentSampleDataCache.get(url);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const loadPromise = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch sample ${url}: ${response.status}`);
      }

      return response.arrayBuffer();
    })
    .catch((error) => {
      instrumentSampleDataCache.delete(url);
      console.error(`Failed to load sample: ${url}`, error);
      return null;
    });

  instrumentSampleDataCache.set(url, loadPromise);
  return loadPromise;
};

const sanitizeFileName = (value: string) => {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "export";
};

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

const audioBufferToWav = (buffer: AudioBuffer) => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
};

const getTrackExportList = (project: Project) => {
  const hasSolo = project.tracks.some((track) => track.solo);
  return project.tracks.filter((track) => {
    if (track.muted) {
      return false;
    }

    if (hasSolo && !track.solo) {
      return false;
    }

    return true;
  });
};

const getRenderRange = (
  project: Project,
  options: ExportOptions,
): RenderRange => {
  if (!options.useLoopRange) {
    return {
      start: 0,
      end: Math.max(MIN_RENDER_DURATION_SECONDS, project.duration),
      duration: Math.max(MIN_RENDER_DURATION_SECONDS, project.duration),
    };
  }

  const requestedStart = Math.max(0, options.loopStart ?? 0);
  const requestedEnd = Math.max(
    requestedStart + MIN_RENDER_DURATION_SECONDS,
    options.loopEnd ?? project.duration,
  );

  return {
    start: requestedStart,
    end: requestedEnd,
    duration: Math.max(
      MIN_RENDER_DURATION_SECONDS,
      requestedEnd - requestedStart,
    ),
  };
};

const createOfflineContext = (range: RenderRange) => {
  return new OfflineAudioContext({
    numberOfChannels: DEFAULT_CHANNELS,
    length: Math.max(1, Math.ceil(range.duration * DEFAULT_SAMPLE_RATE)),
    sampleRate: DEFAULT_SAMPLE_RATE,
  });
};

const getDecodedInstrumentSample = (
  offlineCtx: OfflineAudioContext,
  renderState: ExportRenderState,
  url: string,
) => {
  const cachedBuffer = renderState.instrumentBufferCache.get(url);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  const decodePromise = loadInstrumentSampleData(url)
    .then((sampleData) => {
      if (!sampleData) {
        return null;
      }

      return offlineCtx.decodeAudioData(sampleData.slice(0));
    })
    .catch((error) => {
      renderState.instrumentBufferCache.delete(url);
      console.error(`Failed to decode sample: ${url}`, error);
      return null;
    });

  renderState.instrumentBufferCache.set(url, decodePromise);
  return decodePromise;
};

const preloadProjectInstrumentSamples = async (project: Project) => {
  const sampleUrls = new Set<string>();

  getTrackExportList(project).forEach((track) => {
    if (track.type !== "midi") {
      return;
    }

    const instrumentDefinition = getInstrumentDefinition(track.instrument.patchId);
    if (
      instrumentDefinition.type !== "sampler" ||
      !instrumentDefinition.zones?.length
    ) {
      return;
    }

    instrumentDefinition.zones.forEach((zone) => {
      sampleUrls.add(zone.url);
    });
  });

  await Promise.all(
    Array.from(sampleUrls, (url) => loadInstrumentSampleData(url)),
  );
};

const scheduleAudioClip = async (
  offlineCtx: OfflineAudioContext,
  trackGain: GainNode,
  clip: MidiClip,
  range: RenderRange,
) => {
  if (!clip.audioData) {
    return;
  }

  const audioBuffer = await offlineCtx.decodeAudioData(clip.audioData.slice(0));
  const clipOffset = clip.audioOffset ?? 0;
  const availableDuration = Math.max(0, audioBuffer.duration - clipOffset);
  const playbackDuration = Math.max(
    0,
    Math.min(clip.duration, availableDuration),
  );
  if (playbackDuration <= 0) {
    return;
  }

  const clipStart = clip.startTime;
  const clipEnd = clipStart + playbackDuration;
  const audibleStart = Math.max(clipStart, range.start);
  const audibleEnd = Math.min(clipEnd, range.end);
  const audibleDuration = audibleEnd - audibleStart;

  if (audibleDuration <= 0) {
    return;
  }

  const startAt = audibleStart - range.start;
  const playbackOffset = clipOffset + (audibleStart - clipStart);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(trackGain);
  source.start(startAt, playbackOffset, audibleDuration);
};

const scheduleMidiNote = async (
  offlineCtx: OfflineAudioContext,
  trackGain: GainNode,
  track: ProjectTrack,
  clip: MidiClip,
  note: MidiNote,
  range: RenderRange,
  renderState: ExportRenderState,
) => {
  const noteStart = clip.startTime + note.startTime;
  const noteEnd = noteStart + note.duration;
  const audibleStart = Math.max(noteStart, range.start);
  const audibleEnd = Math.min(noteEnd, range.end);
  const audibleDuration = audibleEnd - audibleStart;

  if (audibleDuration <= 0) {
    return;
  }

  const startAt = audibleStart - range.start;
  const playbackOffset = Math.max(0, audibleStart - noteStart);
  const stopAt = startAt + Math.max(MIN_NOTE_DURATION_SECONDS, audibleDuration);
  const velocity = getNormalizedVelocity(note.velocity);
  const instrumentDefinition = getInstrumentDefinition(track.instrument.patchId);
  const selectedZone =
    instrumentDefinition.type === "sampler" && instrumentDefinition.zones?.length
      ? findNearestSampleZone(note.pitch, instrumentDefinition.zones)
      : null;

  if (selectedZone) {
    const samplerBuffer = await getDecodedInstrumentSample(
      offlineCtx,
      renderState,
      selectedZone.url,
    );

    if (samplerBuffer) {
      const source = offlineCtx.createBufferSource();
      const noteGain = offlineCtx.createGain();
      const releaseSeconds = instrumentDefinition.oneShot
        ? Math.min(0.45, samplerBuffer.duration)
        : SAMPLER_RELEASE_SECONDS;
      const sourceOffset = instrumentDefinition.oneShot
        ? 0
        : Math.min(playbackOffset, Math.max(0, samplerBuffer.duration - 0.01));
      const samplerStopAt = instrumentDefinition.oneShot
        ? startAt + Math.min(samplerBuffer.duration, 2)
        : stopAt + releaseSeconds;
      const holdUntil = instrumentDefinition.oneShot
        ? Math.min(startAt + 0.03, samplerStopAt)
        : Math.max(startAt + 0.012, stopAt - 0.18);

      source.buffer = samplerBuffer;
      source.playbackRate.value =
        instrumentDefinition.pitchTracking === false
          ? 1
          : Math.pow(2, (note.pitch - selectedZone.pitch) / 12);

      noteGain.gain.setValueAtTime(0, startAt);
      noteGain.gain.linearRampToValueAtTime(
        velocity,
        startAt + (instrumentDefinition.oneShot ? 0.002 : 0.004),
      );

      if (instrumentDefinition.oneShot) {
        noteGain.gain.exponentialRampToValueAtTime(
          Math.max(0.12, velocity * 0.55),
          holdUntil,
        );
        noteGain.gain.exponentialRampToValueAtTime(0.001, samplerStopAt);
      } else {
        noteGain.gain.setValueAtTime(velocity, holdUntil);
        noteGain.gain.exponentialRampToValueAtTime(
          Math.max(0.05, velocity * 0.55),
          stopAt + releaseSeconds * 0.28,
        );
        noteGain.gain.exponentialRampToValueAtTime(0.001, samplerStopAt);
      }

      source.connect(noteGain);
      noteGain.connect(trackGain);
      source.start(startAt, sourceOffset);
      source.stop(samplerStopAt);
      return;
    }
  }

  const oscillator = offlineCtx.createOscillator();
  const noteGain = offlineCtx.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.value = midiNoteToFrequency(note.pitch);

  noteGain.gain.setValueAtTime(0, startAt);
  noteGain.gain.linearRampToValueAtTime(velocity, startAt + 0.01);
  noteGain.gain.setValueAtTime(
    velocity,
    Math.max(startAt + 0.01, stopAt - 0.05),
  );
  noteGain.gain.exponentialRampToValueAtTime(0.001, stopAt);

  oscillator.connect(noteGain);
  noteGain.connect(trackGain);
  oscillator.start(startAt);
  oscillator.stop(stopAt);
};

const scheduleTrack = async (
  offlineCtx: OfflineAudioContext,
  track: ProjectTrack,
  range: RenderRange,
  destination: AudioNode,
  renderState: ExportRenderState,
) => {
  const trackGain = offlineCtx.createGain();
  const trackPanner = offlineCtx.createStereoPanner();

  trackGain.gain.value = track.volume;
  trackPanner.pan.value = track.pan;

  trackGain.connect(trackPanner);
  trackPanner.connect(destination);

  if (track.type === "audio") {
    await Promise.all(
      track.clips.map((clip) => {
        return scheduleAudioClip(offlineCtx, trackGain, clip, range);
      }),
    );
    return;
  }

  await Promise.all(
    track.clips.map(async (clip) => {
      if (!clip.notes.length) {
        return;
      }

      await Promise.all(
        clip.notes.map((note) => {
          return scheduleMidiNote(
            offlineCtx,
            trackGain,
            track,
            clip,
            note,
            range,
            renderState,
          );
        }),
      );
    }),
  );
};

const renderMasterBuffer = async (project: Project, range: RenderRange) => {
  const offlineCtx = createOfflineContext(range);
  const renderState: ExportRenderState = {
    instrumentBufferCache: new Map(),
  };
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  const tracks = getTrackExportList(project);
  await Promise.all(
    tracks.map((track) => {
      return scheduleTrack(offlineCtx, track, range, masterGain, renderState);
    }),
  );

  return offlineCtx.startRendering();
};

const renderStemBuffers = async (project: Project, range: RenderRange) => {
  const tracks = getTrackExportList(project);

  return Promise.all(
    tracks.map(async (track, index) => {
      const offlineCtx = createOfflineContext(range);
      const renderState: ExportRenderState = {
        instrumentBufferCache: new Map(),
      };
      await scheduleTrack(
        offlineCtx,
        track,
        range,
        offlineCtx.destination,
        renderState,
      );
      const buffer = await offlineCtx.startRendering();

      return {
        buffer,
        fileName: `${String(index + 1).padStart(2, "0")}_${sanitizeFileName(track.name)}.wav`,
      };
    }),
  );
};

export const useAudioExport = () => {
  const { toast } = useToast();

  const exportProjectAudio = useCallback(
    async (project: Project, options: ExportOptions) => {
      try {
        await preloadProjectInstrumentSamples(project);
        const range = getRenderRange(project, options);

        if (options.mode === "master") {
          const renderedBuffer = await renderMasterBuffer(project, range);
          const wavBlob = audioBufferToWav(renderedBuffer);
          const suffix = options.useLoopRange
            ? `_loop_${range.start.toFixed(2)}-${range.end.toFixed(2)}`
            : "";

          downloadBlob(
            wavBlob,
            `${sanitizeFileName(project.name)}${suffix}.wav`,
          );
          return true;
        }

        const stemBuffers = await renderStemBuffers(project, range);
        const archiveEntries: Record<string, Uint8Array> = {};

        await Promise.all(
          stemBuffers.map(async ({ buffer, fileName }) => {
            const wavBlob = audioBufferToWav(buffer);
            const arrayBuffer = await wavBlob.arrayBuffer();
            archiveEntries[fileName] = new Uint8Array(arrayBuffer);
          }),
        );

        const { zipSync } = await import("fflate");
        const zipData = zipSync(archiveEntries, { level: 6 });
        const suffix = options.useLoopRange
          ? `_loop_${range.start.toFixed(2)}-${range.end.toFixed(2)}`
          : "";
        const zipBlob = new Blob([zipData], { type: "application/zip" });

        downloadBlob(
          zipBlob,
          `${sanitizeFileName(project.name)}_stems${suffix}.zip`,
        );
        return true;
      } catch (error) {
        console.error("Error exporting project:", error);

        toast({
          title: "Export failed",
          description: "There was an error exporting your project.",
          variant: "destructive",
        });

        return false;
      }
    },
    [toast],
  );

  const exportProjectToWav = useCallback(
    async (project: Project, options?: ExportRangeOptions) => {
      return exportProjectAudio(project, {
        mode: "master",
        useLoopRange: options?.useLoopRange ?? false,
        loopStart: options?.loopStart,
        loopEnd: options?.loopEnd,
      });
    },
    [exportProjectAudio],
  );

  const exportProjectToStems = useCallback(
    async (project: Project, options?: ExportRangeOptions) => {
      return exportProjectAudio(project, {
        mode: "stems",
        useLoopRange: options?.useLoopRange ?? false,
        loopStart: options?.loopStart,
        loopEnd: options?.loopEnd,
      });
    },
    [exportProjectAudio],
  );

  return {
    exportProjectAudio,
    exportProjectToStems,
    exportProjectToWav,
  };
};
