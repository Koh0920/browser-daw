import { create } from "zustand";
import type { TransportState } from "@/types";
import { recordTransportFrame } from "@/utils/playbackDiagnostics";

type TransportTimeListener = (time: number) => void;

interface TransportStore extends TransportState {
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  stop: () => void;
  rewind: () => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  commitCurrentTime: (time: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopPoints: (start: number, end: number) => void;
  toggleMasterMute: () => void;
  setMasterMuted: (muted: boolean) => void;
  setMasterVolume: (volume: number) => void;
}

const initialState: TransportState = {
  isPlaying: false,
  currentTime: 0,
  isLoopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  masterVolume: 0.7,
  isMasterMuted: false,
  revision: 0,
};

const SNAPSHOT_COMMIT_INTERVAL = 0.125;
const transportTimeListeners = new Set<TransportTimeListener>();
let transportCurrentTime = initialState.currentTime;
let lastCommittedTransportTime = initialState.currentTime;

const clampTransportTime = (time: number) => Math.max(0, time);

const writeTransportCssTime = (time: number) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty(
    "--transport-current-time",
    `${time}`,
  );
};

const syncTransportRenderTime = (time: number) => {
  transportCurrentTime = clampTransportTime(time);
  writeTransportCssTime(transportCurrentTime);
  recordTransportFrame();
};

const notifyTransportTimeListeners = () => {
  transportTimeListeners.forEach((listener) => listener(transportCurrentTime));
};

const publishTransportTime = (time: number) => {
  syncTransportRenderTime(time);
  notifyTransportTimeListeners();
};

syncTransportRenderTime(transportCurrentTime);

export const getTransportCurrentTime = () => transportCurrentTime;

export const setTransportRenderTime = (time: number) => {
  syncTransportRenderTime(time);
};

export const emitTransportTime = () => {
  notifyTransportTimeListeners();
};

export const subscribeTransportCurrentTime = (
  listener: TransportTimeListener,
) => {
  transportTimeListeners.add(listener);
  listener(transportCurrentTime);

  return () => {
    transportTimeListeners.delete(listener);
  };
};

export const useTransportStore = create<TransportStore>((set) => ({
  ...initialState,

  play: () => {
    const snapshot = getTransportCurrentTime();
    publishTransportTime(snapshot);
    lastCommittedTransportTime = snapshot;
    set((state) => ({
      isPlaying: true,
      currentTime: snapshot,
      revision: state.revision + 1,
    }));
  },

  pause: () => {
    const snapshot = getTransportCurrentTime();
    publishTransportTime(snapshot);
    lastCommittedTransportTime = snapshot;
    set((state) => ({
      isPlaying: false,
      currentTime: snapshot,
      revision: state.revision + 1,
    }));
  },

  togglePlayback: () => {
    const snapshot = getTransportCurrentTime();
    publishTransportTime(snapshot);
    lastCommittedTransportTime = snapshot;
    set((state) => ({
      isPlaying: !state.isPlaying,
      currentTime: snapshot,
      revision: state.revision + 1,
    }));
  },

  stop: () => {
    const nextTime = 0;
    publishTransportTime(nextTime);
    lastCommittedTransportTime = nextTime;
    set((state) => ({
      ...state,
      isPlaying: false,
      currentTime: nextTime,
      revision: state.revision + 1,
    }));
  },

  rewind: () => {
    const nextTime = 0;
    publishTransportTime(nextTime);
    lastCommittedTransportTime = nextTime;
    set((state) => ({
      ...state,
      currentTime: nextTime,
      revision: state.revision + 1,
    }));
  },

  seek: (time) => {
    const nextTime = clampTransportTime(time);
    publishTransportTime(nextTime);
    lastCommittedTransportTime = nextTime;
    set((state) => ({
      ...state,
      currentTime: nextTime,
      revision: state.revision + 1,
    }));
  },

  setCurrentTime: (time) => {
    const nextTime = clampTransportTime(time);
    publishTransportTime(nextTime);

    if (Math.abs(nextTime - lastCommittedTransportTime) < SNAPSHOT_COMMIT_INTERVAL) {
      return;
    }

    lastCommittedTransportTime = nextTime;
    set(() => ({ currentTime: nextTime }));
  },

  commitCurrentTime: (time) => {
    const nextTime = clampTransportTime(time);

    if (Math.abs(nextTime - lastCommittedTransportTime) < SNAPSHOT_COMMIT_INTERVAL) {
      return;
    }

    lastCommittedTransportTime = nextTime;
    set(() => ({ currentTime: nextTime }));
  },

  setLoopEnabled: (enabled) => {
    set((state) => ({
      ...state,
      isLoopEnabled: enabled,
      revision: state.revision + 1,
    }));
  },

  setLoopPoints: (start, end) => {
    set((state) => ({
      ...state,
      loopStart: Math.max(0, Math.min(start, end)),
      loopEnd: Math.max(start, end),
      revision: state.revision + 1,
    }));
  },

  toggleMasterMute: () => {
    set((state) => ({ ...state, isMasterMuted: !state.isMasterMuted }));
  },

  setMasterMuted: (muted) => {
    set((state) => ({ ...state, isMasterMuted: muted }));
  },

  setMasterVolume: (volume) => {
    set((state) => ({
      ...state,
      masterVolume: Math.min(1, Math.max(0, volume)),
    }));
  },
}));
