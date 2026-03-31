import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_SCHEMA_VERSION,
  createDefaultTrackInstrument,
  migrateProjectSchema,
} from "@/projects/projectSchema";
import type { Project } from "@/types";

const createLegacyProjectFixture = (): Project => ({
  id: "legacy-project",
  name: "Legacy Session",
  bpm: 120,
  duration: 8,
  tracks: [
    {
      id: "midi-track",
      name: "Synth",
      type: "midi",
      clips: [
        {
          id: "midi-clip",
          clipType: "midi",
          name: "Phrase",
          startTime: 0,
          duration: 1,
          notes: [
            {
              id: "note-1",
              pitch: 60,
              startTime: 0,
              duration: 0.5,
              velocity: 96,
            },
          ],
        },
      ],
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      instrument: {
        type: "oscillator",
        patchId: "Basic Synth",
        parameters: {},
      },
    },
    {
      id: "audio-track",
      name: "Audio",
      type: "audio",
      clips: [
        {
          id: "audio-clip",
          clipType: "audio",
          name: "Take",
          startTime: 1,
          duration: 2,
          audioAssetPath: "legacy-project/audio-clip.wav",
        },
      ],
      volume: 0.7,
      pan: 0,
      muted: false,
      solo: false,
      instrument: {
        type: "sampler",
        parameters: {},
      },
    },
  ],
  createdAt: 1,
  lastModified: 2,
});

test("createDefaultTrackInstrument canonicalizes patch ids and defaults", () => {
  const oscillator = createDefaultTrackInstrument("midi", {
    type: "oscillator",
    patchId: "Basic Synth",
    parameters: { gain: 0.5 },
  });
  const audio = createDefaultTrackInstrument("audio");

  assert.equal(oscillator.patchId, "basic-synth");
  assert.equal(oscillator.parameters.oscType, "triangle");
  assert.equal(oscillator.parameters.attackSeconds, 0.01);
  assert.equal(oscillator.parameters.gain, 0.5);
  assert.equal(audio.type, "sampler");
  assert.equal(audio.patchId, undefined);
});

test("createDefaultTrackInstrument applies sampler defaults for drum engine", () => {
  const drumKit = createDefaultTrackInstrument("midi", {
    type: "sampler",
    patchId: "drum-kit",
  });

  assert.equal(drumKit.patchId, "drum-kit");
  assert.equal(drumKit.parameters.gain, 1);
  assert.equal(drumKit.parameters.attackSeconds, 0.002);
  assert.equal(drumKit.parameters.decaySeconds, 0.05);
  assert.equal(drumKit.parameters.releaseSeconds, 0.18);
});

test("migrateProjectSchema upgrades legacy project data", () => {
  const migrated = migrateProjectSchema(createLegacyProjectFixture());

  assert.equal(migrated.projectSchemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.timeSignatureNumerator, 4);
  assert.equal(migrated.timeSignatureDenominator, 4);
  assert.equal(migrated.tracks[0].recordArmed, false);
  assert.equal(migrated.tracks[0].instrument.patchId, "basic-synth");
  assert.equal(migrated.tracks[0].instrument.parameters.oscType, "triangle");
  assert.equal(migrated.tracks[1].recordArmed, false);
  assert.equal(migrated.tracks[1].instrument.patchId, undefined);
  if (migrated.tracks[1].type !== "audio") {
    assert.fail("Expected audio track");
  }
  assert.equal(migrated.tracks[1].clips[0].clipType, "audio");
  assert.equal(migrated.tracks[1].clips[0].audioOffset, 0);
  assert.equal(migrated.tracks[1].clips[0].sourceDuration, 2);
});