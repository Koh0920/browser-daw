import { useProjectStore } from "@/stores/projectStore";
import { useTransportStore } from "@/stores/transportStore";

export const useTransportCurrentTime = () =>
  useTransportStore((state) => state.currentTime);

export const useTransport = () => {
  const activeInputId = useTransportStore((state) => state.activeInputId);
  const inputMode = useTransportStore((state) => state.inputMode);
  useProjectStore((state) => state.currentProject);
  const isLoopEnabled = useTransportStore((state) => state.isLoopEnabled);
  const isMasterMuted = useTransportStore((state) => state.isMasterMuted);
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const isRecording = useTransportStore((state) => state.isRecording);
  const loopEnd = useTransportStore((state) => state.loopEnd);
  const loopStart = useTransportStore((state) => state.loopStart);
  const masterVolume = useTransportStore((state) => state.masterVolume);
  const recordingClipId = useTransportStore((state) => state.recordingClipId);
  const recordingStartTime = useTransportStore(
    (state) => state.recordingStartTime,
  );
  const recordingTrackId = useTransportStore((state) => state.recordingTrackId);
  const revision = useTransportStore((state) => state.revision);
  const play = useTransportStore((state) => state.play);
  const pause = useTransportStore((state) => state.pause);
  const rewind = useTransportStore((state) => state.rewind);
  const seek = useTransportStore((state) => state.seek);
  const setCurrentTime = useTransportStore((state) => state.setCurrentTime);
  const setActiveInput = useTransportStore((state) => state.setActiveInput);
  const setLoopEnabled = useTransportStore((state) => state.setLoopEnabled);
  const setLoopPoints = useTransportStore((state) => state.setLoopPoints);
  const setMasterMuted = useTransportStore((state) => state.setMasterMuted);
  const setMasterVolume = useTransportStore((state) => state.setMasterVolume);
  const startRecording = useTransportStore((state) => state.startRecording);
  const stop = useTransportStore((state) => state.stop);
  const stopRecording = useTransportStore((state) => state.stopRecording);
  const toggleMasterMute = useTransportStore((state) => state.toggleMasterMute);
  const togglePlayback = useTransportStore((state) => state.togglePlayback);

  return {
    activeInputId,
    inputMode,
    isLoopEnabled,
    isMasterMuted,
    isPlaying,
    isRecording,
    loopEnd,
    loopStart,
    masterVolume,
    play,
    pause,
    recordingClipId,
    recordingStartTime,
    recordingTrackId,
    rewind,
    revision,
    seek,
    setActiveInput,
    setCurrentTime,
    setLoopEnabled,
    setLoopPoints,
    setMasterMuted,
    setMasterVolume,
    startRecording,
    stop,
    stopRecording,
    toggleMasterMute,
    togglePlayback,
    isLooping: isLoopEnabled,
    togglePlay: togglePlayback,
    seekTo: seek,
    setLooping: setLoopEnabled,
  };
};
