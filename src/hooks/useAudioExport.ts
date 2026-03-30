"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { Project } from "@/types";

export const useAudioExport = () => {
  const { toast } = useToast();

  const exportProjectToWav = useCallback(
    async (project: Project) => {
      try {
        // Create offline audio context for rendering
        const offlineCtx = new OfflineAudioContext({
          numberOfChannels: 2,
          length: 44100 * project.duration,
          sampleRate: 44100,
        });

        // Create master gain node
        const masterGain = offlineCtx.createGain();
        masterGain.connect(offlineCtx.destination);

        // Process each track
        const trackPromises = project.tracks.map(async (track) => {
          // Skip muted tracks
          if (track.muted) return;

          // Create track gain node
          const trackGain = offlineCtx.createGain();
          trackGain.gain.value = track.volume;

          // Create panner if needed
          if (track.pan !== 0) {
            const panner = offlineCtx.createStereoPanner();
            panner.pan.value = track.pan;
            trackGain.connect(panner);
            panner.connect(masterGain);
          } else {
            trackGain.connect(masterGain);
          }

          // Process clips
          if (track.type === "audio") {
            for (const clip of track.clips) {
              if (!clip.audioData) continue;

              // Decode audio data
              const audioBuffer = await offlineCtx.decodeAudioData(
                clip.audioData.slice(0),
              );
              const clipOffset = clip.audioOffset ?? 0;
              const clipDuration = Math.max(
                0.05,
                Math.min(clip.duration, audioBuffer.duration - clipOffset),
              );
              if (clipDuration <= 0) continue;

              // Create source
              const source = offlineCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(trackGain);

              // Schedule playback
              source.start(clip.startTime, clipOffset, clipDuration);
            }
          } else if (track.type === "midi") {
            for (const clip of track.clips) {
              if (!clip.notes || clip.notes.length === 0) continue;

              for (const note of clip.notes) {
                // Create oscillator for each note
                const oscillator = offlineCtx.createOscillator();
                const noteGain = offlineCtx.createGain();

                // Set oscillator properties
                oscillator.type = "sine";
                oscillator.frequency.value =
                  440 * Math.pow(2, (note.pitch - 69) / 12);

                // Connect oscillator
                oscillator.connect(noteGain);
                noteGain.connect(trackGain);

                // Set gain based on velocity
                const velocity = note.velocity / 127;
                noteGain.gain.value = velocity * 0.5;

                // Schedule note
                const noteStartTime = clip.startTime + note.startTime;
                oscillator.start(noteStartTime);
                oscillator.stop(noteStartTime + note.duration);
              }
            }
          }
        });

        // Wait for all tracks to be processed
        await Promise.all(trackPromises);

        // Render audio
        const renderedBuffer = await offlineCtx.startRendering();

        // Convert to WAV
        const wavBlob = audioBufferToWav(renderedBuffer);

        // Create download link
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${project.name}.wav`;
        link.click();

        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);

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

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer: AudioBuffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * numChannels * bytesPerSample;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // RIFF identifier
    writeString(view, 0, "RIFF");
    // RIFF chunk length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, "WAVE");
    // format chunk identifier
    writeString(view, 12, "fmt ");
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, format, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * blockAlign, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, "data");
    // data chunk length
    view.setUint32(40, dataLength, true);

    // Write audio data
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

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  return {
    exportProjectToWav,
  };
};
