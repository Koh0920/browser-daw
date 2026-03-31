import test from "node:test";
import assert from "node:assert/strict";
import { planInstrumentVoice } from "@/audio/engine/voicePlanning";
import type { InstrumentConfig } from "@/types";

test("planInstrumentVoice canonicalizes oscillator planning", () => {
  const instrument: InstrumentConfig = {
    type: "oscillator",
    patchId: "basic-synth",
    parameters: {},
  };

  const voicePlan = planInstrumentVoice({
    instrument,
    note: { pitch: 69, velocity: 100, duration: 0.5 },
    mode: "timeline",
  });

  assert.equal(voicePlan.instrumentId, "basic-synth");
  assert.equal(voicePlan.zone, null);
  assert.equal(voicePlan.oscillatorType, "triangle");
  assert.equal(voicePlan.playbackRate, 1);
  assert.equal(voicePlan.attackSeconds, 0.01);
  assert.equal(voicePlan.releaseSeconds, 0.08);
  assert.equal(voicePlan.decaySeconds, 0.04);
  assert.equal(voicePlan.sustainLevel, 0.8);
});

test("planInstrumentVoice resolves sampler zone and playback rate", () => {
  const instrument: InstrumentConfig = {
    type: "sampler",
    patchId: "piano",
    parameters: {},
  };

  const voicePlan = planInstrumentVoice({
    instrument,
    note: { pitch: 64, velocity: 90, duration: 1 },
    mode: "offline",
  });

  assert.ok(voicePlan.zone);
  assert.equal(voicePlan.instrumentId, "piano");
  assert.equal(voicePlan.attackSeconds, 0.004);
  assert.equal(voicePlan.releaseSeconds, 1.35);
  assert.equal(voicePlan.decaySeconds, 0.12);
  assert.equal(voicePlan.sustainLevel, 0.72);
  assert.equal(voicePlan.playbackRate > 0, true);
});

test("planInstrumentVoice keeps shorter live sampler releases", () => {
  const instrument: InstrumentConfig = {
    type: "sampler",
    patchId: "drum-kit",
    parameters: {},
  };

  const voicePlan = planInstrumentVoice({
    instrument,
    note: { pitch: 36, velocity: 110, duration: 0.25 },
    mode: "live",
  });

  assert.equal(voicePlan.oneShot, true);
  assert.equal(voicePlan.releaseSeconds, 0.18);
  assert.equal(voicePlan.zone?.url, "/samples/drums/kick-c2.mp3");
});

test("planInstrumentVoice respects zone pitch ranges and root notes", () => {
  const voicePlan = planInstrumentVoice({
    instrument: {
      type: "sampler",
      patchId: "piano",
      parameters: {},
    },
    note: { pitch: 55, velocity: 80, duration: 1 },
    mode: "timeline",
  });

  assert.equal(voicePlan.zone?.rootNote, 60);
  assert.equal(voicePlan.zone?.url, "/samples/piano-c4.mp3");
});

test("planInstrumentVoice applies instrument gain multiplier", () => {
  const voicePlan = planInstrumentVoice({
    instrument: {
      type: "oscillator",
      patchId: "basic-synth",
      parameters: {
        gain: 0.5,
      },
    },
    note: { pitch: 69, velocity: 127, duration: 0.5 },
    mode: "timeline",
  });

  assert.equal(voicePlan.normalizedVelocity, 1);
  assert.equal(voicePlan.gain, 0.5);
});