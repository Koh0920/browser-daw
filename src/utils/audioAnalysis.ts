export const readChannelPeaks = (
  channelData: Float32Array,
  sampleCount: number,
) => {
  const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
  const waveform = new Array<number>(sampleCount).fill(0);

  for (let i = 0; i < sampleCount; i++) {
    const start = i * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let peak = 0;

    for (let index = start; index < end; index++) {
      peak = Math.max(peak, Math.abs(channelData[index]));
    }

    waveform[i] = peak;
  }

  return waveform;
};

export const analyzeAudioData = async (audioData: ArrayBuffer) => {
  const context = new OfflineAudioContext(1, 1, 44100);

  try {
    const decoded = await context.decodeAudioData(audioData.slice(0));
    return {
      duration: decoded.duration,
      waveformData: readChannelPeaks(decoded.getChannelData(0), 512),
    };
  } catch (error) {
    console.error("Audio decoding failed during analysis", error);
    throw error;
  }
};
