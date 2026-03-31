import { useProjectStore } from "@/stores/projectStore";
import {
  useTransportStore,
} from "@/stores/transportStore";

export const useTransportCurrentTime = () =>
  useTransportStore((state) => state.currentTime);

export const useTransport = () => {
  useProjectStore((state) => state.currentProject);
  const isLoopEnabled = useTransportStore((state) => state.isLoopEnabled);
  const isMasterMuted = useTransportStore((state) => state.isMasterMuted);
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const loopEnd = useTransportStore((state) => state.loopEnd);
  const loopStart = useTransportStore((state) => state.loopStart);
  const masterVolume = useTransportStore((state) => state.masterVolume);
  const revision = useTransportStore((state) => state.revision);
  const play = useTransportStore((state) => state.play);
  const pause = useTransportStore((state) => state.pause);
  const rewind = useTransportStore((state) => state.rewind);
  const seek = useTransportStore((state) => state.seek);
  const setCurrentTime = useTransportStore((state) => state.setCurrentTime);
  const setLoopEnabled = useTransportStore((state) => state.setLoopEnabled);
  const setLoopPoints = useTransportStore((state) => state.setLoopPoints);
  const setMasterMuted = useTransportStore((state) => state.setMasterMuted);
  const setMasterVolume = useTransportStore((state) => state.setMasterVolume);
  const stop = useTransportStore((state) => state.stop);
  const toggleMasterMute = useTransportStore((state) => state.toggleMasterMute);
  const togglePlayback = useTransportStore((state) => state.togglePlayback);

  return {
    isLoopEnabled,
    isMasterMuted,
    isPlaying,
    loopEnd,
    loopStart,
    masterVolume,
    play,
    pause,
    rewind,
    revision,
    seek,
    setCurrentTime,
    setLoopEnabled,
    setLoopPoints,
    setMasterMuted,
    setMasterVolume,
    stop,
    toggleMasterMute,
    togglePlayback,
    isLooping: isLoopEnabled,
    togglePlay: togglePlayback,
    seekTo: seek,
    setLooping: setLoopEnabled,
  };
};
