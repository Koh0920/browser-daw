"use client";

import { useCallback } from "react";
import { zipSync } from "fflate";
import { useToast } from "@/components/ui/use-toast";
import type { MidiClip, MidiNote, Project, ProjectTrack } from "@/types";

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHANNELS = 2;
const MIN_RENDER_DURATION_SECONDS = 0.05;

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

const midiNoteToFrequency = (note: number) =>
  440 * Math.pow(2, (note - 69) / 12);

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

const scheduleMidiNote = (
  offlineCtx: OfflineAudioContext,
  trackGain: GainNode,
  clip: MidiClip,
  note: MidiNote,
  range: RenderRange,
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
  const stopAt = startAt + audibleDuration;
  const oscillator = offlineCtx.createOscillator();
  const noteGain = offlineCtx.createGain();
  const velocity = note.velocity / 127;

  oscillator.type = "sine";
  oscillator.frequency.value = midiNoteToFrequency(note.pitch);

  noteGain.gain.setValueAtTime(velocity * 0.5, startAt);
  noteGain.gain.setValueAtTime(
    velocity * 0.5,
    Math.max(startAt, stopAt - 0.01),
  );
  noteGain.gain.linearRampToValueAtTime(0.0001, stopAt);

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

  track.clips.forEach((clip) => {
    if (!clip.notes.length) {
      return;
    }

    clip.notes.forEach((note) => {
      scheduleMidiNote(offlineCtx, trackGain, clip, note, range);
    });
  });
};

const renderMasterBuffer = async (project: Project, range: RenderRange) => {
  const offlineCtx = createOfflineContext(range);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  const tracks = getTrackExportList(project);
  await Promise.all(
    tracks.map((track) => {
      return scheduleTrack(offlineCtx, track, range, masterGain);
    }),
  );

  return offlineCtx.startRendering();
};

const renderStemBuffers = async (project: Project, range: RenderRange) => {
  const tracks = getTrackExportList(project);

  return Promise.all(
    tracks.map(async (track, index) => {
      const offlineCtx = createOfflineContext(range);
      await scheduleTrack(offlineCtx, track, range, offlineCtx.destination);
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
