import { create } from "zustand";
import type { MidiClip, MidiNote, Project, ProjectTrack } from "@/types";
import { parseMidiFile } from "@/utils/midiImport";
import { writeAudioAsset } from "@/utils/audioStorage";

const createId = () => crypto.randomUUID();

const touchProject = (project: Project): Project => ({
  ...project,
  lastModified: Date.now(),
});

const createMidiTrack = (
  trackCount: number,
  duration: number,
  name?: string,
): ProjectTrack => ({
  id: createId(),
  name: name || `MIDI Track ${trackCount + 1}`,
  type: "midi",
  clips: [
    {
      id: createId(),
      name: "Default Clip",
      startTime: 0,
      duration,
      notes: [],
    },
  ],
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  instrument: {
    type: "oscillator",
    parameters: {
      gain: 1.0,
      oscType: "triangle",
    },
  },
});

const createAudioTrack = (trackCount: number, name?: string): ProjectTrack => ({
  id: createId(),
  name: name || `Audio Track ${trackCount + 1}`,
  type: "audio",
  clips: [],
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  instrument: {
    type: "sampler",
    parameters: {},
  },
});

const readChannelPeaks = (channelData: Float32Array, sampleCount: number) => {
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

const analyzeAudioData = async (audioData: ArrayBuffer) => {
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

const clampAudioClipDuration = (clip: MidiClip) => {
  const sourceOffset = clip.audioOffset ?? 0;
  const sourceDuration = clip.sourceDuration ?? clip.duration;
  return Math.max(
    0.05,
    Math.min(clip.duration, Math.max(0.05, sourceDuration - sourceOffset)),
  );
};

interface ProjectState {
  currentProject: Project | null;
  currentProjectId: string | null;
  selectedTrackId: string | null;
  isProjectModified: boolean;
  createProject: (name: string) => Project;
  loadProject: (project: Project) => void;
  clearProject: () => void;
  markSaved: () => void;
  selectTrack: (trackId: string | null) => void;
  addMidiTrack: (name?: string) => void;
  addAudioTrack: (name?: string) => string | null;
  addAudioClip: (
    trackId: string,
    clip: {
      name: string;
      startTime: number;
      audioData: ArrayBuffer;
      audioFileName?: string;
      audioMimeType?: string;
    },
  ) => Promise<void>;
  moveAudioClip: (trackId: string, clipId: string, startTime: number) => void;
  trimAudioClip: (
    trackId: string,
    clipId: string,
    startTime: number,
    duration: number,
    trimMode: "start" | "end",
  ) => void;
  splitAudioClip: (trackId: string, clipId: string, splitTime: number) => void;
  removeTrack: (trackId: string) => void;
  importMidiFile: (file: File) => Promise<void>;
  replaceClipNotes: (
    trackId: string,
    clipId: string,
    notes: MidiNote[],
  ) => void;
  updateTrack: (trackId: string, updates: Partial<ProjectTrack>) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  currentProjectId: null,
  selectedTrackId: null,
  isProjectModified: false,

  createProject: (name) => {
    const project: Project = {
      id: createId(),
      name,
      bpm: 120,
      duration: 16,
      tracks: [],
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    set({
      currentProject: project,
      currentProjectId: project.id,
      selectedTrackId: null,
      isProjectModified: true,
    });

    return project;
  },

  loadProject: (project) => {
    set({
      currentProject: project,
      currentProjectId: project.id,
      selectedTrackId: project.tracks[0]?.id ?? null,
      isProjectModified: false,
    });
  },

  clearProject: () => {
    set({
      currentProject: null,
      currentProjectId: null,
      selectedTrackId: null,
      isProjectModified: false,
    });
  },

  markSaved: () => {
    set({ isProjectModified: false });
  },

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId });
  },

  addMidiTrack: (name) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const track = createMidiTrack(
        state.currentProject.tracks.length,
        state.currentProject.duration,
        name,
      );

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: [...state.currentProject.tracks, track],
        }),
        selectedTrackId: track.id,
        isProjectModified: true,
      };
    });
  },

  addAudioTrack: (name) => {
    let createdTrackId: string | null = null;

    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const track = createAudioTrack(state.currentProject.tracks.length, name);
      createdTrackId = track.id;

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: [...state.currentProject.tracks, track],
        }),
        selectedTrackId: track.id,
        isProjectModified: true,
      };
    });

    return createdTrackId;
  },

  addAudioClip: async (trackId, clipInput) => {
    const state = useProjectStore.getState();
    const currentProject = state.currentProject;
    if (!currentProject) {
      return;
    }

    const clipId = createId();
    const analysis = await analyzeAudioData(clipInput.audioData);
    const audioAssetPath = await writeAudioAsset(
      currentProject.id,
      clipId,
      clipInput.audioFileName ?? clipInput.name,
      clipInput.audioData,
    );

    set((projectState) => {
      if (!projectState.currentProject) {
        return projectState;
      }

      const tracks = projectState.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "audio") {
          return track;
        }

        const clip: MidiClip = {
          id: clipId,
          name: clipInput.name,
          startTime: clipInput.startTime,
          duration: analysis.duration,
          notes: [],
          audioData: clipInput.audioData,
          audioAssetPath: audioAssetPath ?? undefined,
          audioFileName: clipInput.audioFileName ?? clipInput.name,
          audioMimeType: clipInput.audioMimeType,
          audioOffset: 0,
          sourceDuration: analysis.duration,
          waveformData: analysis.waveformData,
        };

        return {
          ...track,
          clips: [...track.clips, clip].sort(
            (left, right) => left.startTime - right.startTime,
          ),
        };
      });

      return {
        currentProject: touchProject({
          ...projectState.currentProject,
          duration: Math.max(
            projectState.currentProject.duration,
            clipInput.startTime + analysis.duration,
          ),
          tracks,
        }),
        selectedTrackId: trackId,
        isProjectModified: true,
      };
    });
  },

  moveAudioClip: (trackId, clipId, startTime) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "audio") {
          return track;
        }

        return {
          ...track,
          clips: track.clips
            .map((clip) => {
              if (clip.id !== clipId) {
                return clip;
              }

              return {
                ...clip,
                startTime: Math.max(0, startTime),
              };
            })
            .sort((left, right) => left.startTime - right.startTime),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      };
    });
  },

  trimAudioClip: (trackId, clipId, startTime, duration, trimMode) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "audio") {
          return track;
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip;
            }

            if (trimMode === "start") {
              const nextStartTime = Math.max(0, startTime);
              const startDelta = Math.max(0, nextStartTime - clip.startTime);
              const nextOffset = (clip.audioOffset ?? 0) + startDelta;

              return {
                ...clip,
                startTime: nextStartTime,
                audioOffset: nextOffset,
                duration: clampAudioClipDuration({
                  ...clip,
                  startTime: nextStartTime,
                  duration: Math.max(0.05, duration),
                  audioOffset: nextOffset,
                }),
              };
            }

            return {
              ...clip,
              duration: clampAudioClipDuration({
                ...clip,
                duration: Math.max(0.05, duration),
              }),
            };
          }),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      };
    });
  },

  splitAudioClip: (trackId, clipId, splitTime) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "audio") {
          return track;
        }

        const nextClips: MidiClip[] = [];

        track.clips.forEach((clip) => {
          if (clip.id !== clipId) {
            nextClips.push(clip);
            return;
          }

          const relativeSplitTime = splitTime - clip.startTime;
          if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) {
            nextClips.push(clip);
            return;
          }

          nextClips.push({
            ...clip,
            duration: relativeSplitTime,
          });

          nextClips.push({
            ...clip,
            id: createId(),
            startTime: splitTime,
            duration: clip.duration - relativeSplitTime,
            audioOffset: (clip.audioOffset ?? 0) + relativeSplitTime,
          });
        });

        return {
          ...track,
          clips: nextClips.sort(
            (left, right) => left.startTime - right.startTime,
          ),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      };
    });
  },

  removeTrack: (trackId) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.filter(
        (track) => track.id !== trackId,
      );

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        selectedTrackId: tracks[0]?.id ?? null,
        isProjectModified: true,
      };
    });
  },

  importMidiFile: async (file) => {
    const imported = await parseMidiFile(file);

    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      return {
        currentProject: touchProject({
          ...state.currentProject,
          bpm: Math.round(imported.bpm),
          duration: Math.max(state.currentProject.duration, imported.duration),
          tracks: [...state.currentProject.tracks, ...imported.tracks],
        }),
        selectedTrackId: imported.tracks[0]?.id ?? state.selectedTrackId,
        isProjectModified: true,
      };
    });
  },

  replaceClipNotes: (trackId, clipId, notes) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip;
            }

            const duration = notes.reduce((maxDuration, note) => {
              return Math.max(maxDuration, note.startTime + note.duration);
            }, 0);

            return {
              ...clip,
              duration,
              notes,
            };
          }),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      };
    });
  },

  updateTrack: (trackId, updates) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          ...updates,
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      };
    });
  },
}));
