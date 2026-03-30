import { create } from "zustand"
import type { TransportState } from "@/types"

interface TransportStore extends TransportState {
  play: () => void
  pause: () => void
  togglePlayback: () => void
  stop: () => void
  rewind: () => void
  seek: (time: number) => void
  setCurrentTime: (time: number) => void
  setLoopEnabled: (enabled: boolean) => void
  setLoopPoints: (start: number, end: number) => void
}

const initialState: TransportState = {
  isPlaying: false,
  currentTime: 0,
  isLoopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  revision: 0,
}

export const useTransportStore = create<TransportStore>((set) => ({
  ...initialState,

  play: () => {
    set((state) => ({ isPlaying: true, revision: state.revision + 1 }))
  },

  pause: () => {
    set((state) => ({ isPlaying: false, revision: state.revision + 1 }))
  },

  togglePlayback: () => {
    set((state) => ({ isPlaying: !state.isPlaying, revision: state.revision + 1 }))
  },

  stop: () => {
    set((state) => ({ ...state, isPlaying: false, currentTime: 0, revision: state.revision + 1 }))
  },

  rewind: () => {
    set((state) => ({ ...state, currentTime: 0, revision: state.revision + 1 }))
  },

  seek: (time) => {
    set((state) => ({ ...state, currentTime: Math.max(0, time), revision: state.revision + 1 }))
  },

  setCurrentTime: (time) => {
    set(() => ({ currentTime: Math.max(0, time) }))
  },

  setLoopEnabled: (enabled) => {
    set((state) => ({ ...state, isLoopEnabled: enabled, revision: state.revision + 1 }))
  },

  setLoopPoints: (start, end) => {
    set((state) => ({
      ...state,
      loopStart: Math.max(0, Math.min(start, end)),
      loopEnd: Math.max(start, end),
      revision: state.revision + 1,
    }))
  },
}))