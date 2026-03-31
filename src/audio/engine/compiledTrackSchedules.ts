import { planInstrumentVoice } from "@/audio/engine/voicePlanning";
import type { AudioClip, MidiClip, MidiNote, Project, ProjectTrack } from "@/types";

export interface CompiledAudioClipEvent {
  clip: AudioClip;
  absoluteStartTime: number;
  estimatedEndTime: number;
}

export interface CompiledMidiNoteEvent {
  clip: MidiClip;
  note: MidiNote;
  absoluteStartTime: number;
  absoluteEndTime: number;
  voicePlan: ReturnType<typeof planInstrumentVoice>;
}

export interface CompiledTrackSchedule {
  track: ProjectTrack;
  audioClipEvents: CompiledAudioClipEvent[];
  midiNoteEvents: CompiledMidiNoteEvent[];
}

export const buildCompiledTrackSchedules = (
  project: Project | null,
): CompiledTrackSchedule[] => {
  if (!project) {
    return [];
  }

  return project.tracks.map((track) => {
    if (track.type === "audio") {
      return {
        track,
        audioClipEvents: [...track.clips]
          .sort((left, right) => left.startTime - right.startTime)
          .map((clip) => ({
            clip,
            absoluteStartTime: clip.startTime,
            estimatedEndTime: clip.startTime + Math.max(clip.duration, 0),
          })),
        midiNoteEvents: [],
      };
    }
    return {
      track,
      audioClipEvents: [],
      midiNoteEvents: track.clips
        .flatMap((clip) =>
          clip.notes.map((note) => {
            const voicePlan = planInstrumentVoice({
              instrument: track.instrument,
              note,
              mode: "timeline",
            });

            return {
              clip,
              note,
              absoluteStartTime: clip.startTime + note.startTime,
              absoluteEndTime: clip.startTime + note.startTime + note.duration,
              voicePlan,
            };
          }),
        )
        .sort((left, right) => left.absoluteStartTime - right.absoluteStartTime),
    };
  });
};