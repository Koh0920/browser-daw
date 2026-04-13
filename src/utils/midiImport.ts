import { Midi } from "@tonejs/midi"
import { createDefaultTrackInstrument } from "@/projects/projectSchema"
import type { ImportedMidiProject, MidiClip, MidiNote, MidiTrack } from "@/types"
import { createId } from "@/utils/id"

export async function parseMidiFile(file: File): Promise<ImportedMidiProject> {
  const buffer = await file.arrayBuffer()
  const midi = new Midi(buffer)

  const tracks: MidiTrack[] = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track, index) => {
      const notes: MidiNote[] = track.notes.map((note) => ({
        id: createId(),
        pitch: note.midi,
        startTime: note.time,
        duration: note.duration,
        velocity: Math.round(note.velocity * 127),
      }))

      const clipDuration = notes.reduce((maxDuration, note) => {
        return Math.max(maxDuration, note.startTime + note.duration)
      }, 0)

      const clip: MidiClip = {
        id: createId(),
        clipType: "midi",
        name: track.name || `Clip ${index + 1}`,
        startTime: 0,
        duration: clipDuration,
        notes,
        sourceFile: file.name,
        sourceTrackIndex: index,
        sourceChannel: track.channel,
      }

      return {
        id: createId(),
        name: track.name || track.instrument.name || `MIDI Track ${index + 1}`,
        type: "midi",
        clips: [clip],
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        instrument: createDefaultTrackInstrument("midi", {
          type: "oscillator",
          patchId: track.instrument.name || "Basic Synth",
          parameters: { gain: 0.5 },
        }),
      }
    })

  return {
    bpm: midi.header.tempos[0]?.bpm ?? 120,
    duration: midi.duration || 0,
    tracks,
  }
}