export interface TrackNodeChain {
  gain: GainNode;
  panner: StereoPannerNode;
}

export interface LiveNoteInstance {
  trackId: string;
  source: AudioScheduledSourceNode;
  gain: GainNode;
  stop: (when?: number) => void;
}

export interface TrackScheduleCursor {
  audioIndex: number;
  midiIndex: number;
}

export interface PlaybackSyncPoint {
  audioTime: number;
  sequenceTime: number;
}