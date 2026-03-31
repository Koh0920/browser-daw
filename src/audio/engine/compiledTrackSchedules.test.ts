import test from "node:test";
import assert from "node:assert/strict";
import { buildCompiledTrackSchedules } from "@/audio/engine/compiledTrackSchedules";
import type { Project } from "@/types";

const createProject = (): Project => ({
  id: "project-1",
  name: "Test Project",
  bpm: 120,
  duration: 8,
  tracks: [
    {
      id: "track-audio",
      name: "Audio",
      type: "audio",
      clips: [
        {
          id: "clip-audio",
          clipType: "audio",
          name: "Take 1",
          startTime: 1,
          duration: 2,
          waveformData: [0.2, 0.5],
        },
      ],
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      instrument: {
        type: "sampler",
        parameters: {},
      },
    },
    {
      id: "track-midi",
      name: "Piano",
      type: "midi",
      clips: [
        {
          id: "clip-midi",
          clipType: "midi",
          name: "Phrase",
          startTime: 0.5,
          duration: 2,
          notes: [
            {
              id: "note-b",
              pitch: 64,
              startTime: 0.5,
              duration: 0.5,
              velocity: 90,
            },
            {
              id: "note-a",
              pitch: 60,
              startTime: 0,
              duration: 0.25,
              velocity: 100,
            },
          ],
        },
      ],
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      instrument: {
        type: "sampler",
        patchId: "piano",
        parameters: {},
      },
    },
  ],
  createdAt: 0,
  lastModified: 0,
});

test("buildCompiledTrackSchedules compiles audio and midi tracks separately", () => {
  const schedules = buildCompiledTrackSchedules(createProject());

  assert.equal(schedules.length, 2);
  assert.equal(schedules[0].audioClipEvents.length, 1);
  assert.equal(schedules[0].midiNoteEvents.length, 0);
  assert.equal(schedules[1].audioClipEvents.length, 0);
  assert.equal(schedules[1].midiNoteEvents.length, 2);
  assert.equal(schedules[1].midiNoteEvents[0].note.id, "note-a");
  assert.equal(schedules[1].midiNoteEvents[1].note.id, "note-b");
  assert.ok(schedules[1].midiNoteEvents[0].voicePlan.zone);
  assert.equal(schedules[1].midiNoteEvents[0].voicePlan.instrumentId, "piano");
});