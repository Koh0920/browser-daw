export const MIN_NOTE_DURATION_SECONDS = 0.05;
export const SAMPLER_RELEASE_SECONDS = 1.35;

export const midiNoteToFrequency = (note: number) =>
  440 * Math.pow(2, (note - 69) / 12);

export const getNormalizedVelocity = (velocity: number) => {
  const normalized = Math.min(1, Math.max(0.08, velocity / 127));
  return Math.pow(normalized, 0.72);
};

export const getAudioClipPlaybackDuration = (
  clipDuration: number,
  bufferDuration: number,
) => {
  if (clipDuration > 0) {
    return Math.min(clipDuration, bufferDuration);
  }

  return bufferDuration;
};

export const ensureAudioContextRunning = async (context: AudioContext) => {
  if (context.state === "running") {
    return true;
  }

  try {
    await context.resume();
  } catch (error) {
    console.error("AudioContext resume failed", error);
    return false;
  }

  return (context.state as AudioContextState) === "running";
};