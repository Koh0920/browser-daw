import test from "node:test";
import assert from "node:assert/strict";
import {
  getAudioClipPlaybackDuration,
  getNormalizedVelocity,
  midiNoteToFrequency,
} from "@/audio/engine/shared";

test("midiNoteToFrequency returns A4 for MIDI note 69", () => {
  assert.equal(midiNoteToFrequency(69), 440);
});

test("getNormalizedVelocity clamps and curves the velocity", () => {
  assert.equal(getNormalizedVelocity(0) > 0, true);
  assert.equal(getNormalizedVelocity(127) <= 1, true);
});

test("getAudioClipPlaybackDuration caps clip playback to available buffer", () => {
  assert.equal(getAudioClipPlaybackDuration(4, 2.5), 2.5);
  assert.equal(getAudioClipPlaybackDuration(0, 2.5), 2.5);
});