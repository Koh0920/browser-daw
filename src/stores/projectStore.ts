import { create } from "zustand";
import type {
  AudioClip,
  AudioTrack,
  MidiClip,
  MidiNote,
  MidiTrack,
  Project,
  ProjectTool,
  ProjectTrack,
} from "@/types";
import { useTransportStore } from "@/stores/transportStore";
import {
  PROJECT_SCHEMA_VERSION,
  createDefaultTrackInstrument,
  migrateProjectSchema,
} from "@/projects/projectSchema";
import { analyzeAudioData } from "@/utils/audioAnalysis";
import { parseMidiFile } from "@/utils/midiImport";
import { writeAudioAsset } from "@/utils/audioStorage";
import { createId } from "@/utils/id";
const TRACK_COLORS = [
  "190 92% 56%",
  "24 96% 63%",
  "147 71% 56%",
  "329 78% 63%",
  "281 87% 68%",
  "49 94% 61%",
];

const pickTrackColor = (trackCount: number) =>
  TRACK_COLORS[trackCount % TRACK_COLORS.length];
const MIN_CLIP_DURATION = 0.05;

const touchProject = (project: Project): Project => ({
  ...project,
  lastModified: Date.now(),
});

const createMidiClip = (name: string, startTime: number): MidiClip => ({
  id: createId(),
  clipType: "midi",
  name,
  startTime,
  duration: 0.25,
  notes: [],
});

const createMidiTrack = (
  trackCount: number,
  duration: number,
  name?: string,
): MidiTrack => ({
  id: createId(),
  name: name || `MIDI Track ${trackCount + 1}`,
  type: "midi",
  trackColor: pickTrackColor(trackCount),
  clips: [
    {
      id: createId(),
      clipType: "midi",
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
  recordArmed: false,
  instrument: createDefaultTrackInstrument("midi"),
});

const createAudioTrack = (trackCount: number, name?: string): AudioTrack => ({
  id: createId(),
  name: name || `Audio Track ${trackCount + 1}`,
  type: "audio",
  trackColor: pickTrackColor(trackCount),
  clips: [],
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  recordArmed: false,
  instrument: createDefaultTrackInstrument("audio"),
});

const clampAudioClipDuration = (clip: AudioClip) => {
  const sourceOffset = clip.audioOffset ?? 0;
  const sourceDuration = clip.sourceDuration ?? clip.duration;
  return Math.max(
    0.05,
    Math.min(clip.duration, Math.max(0.05, sourceDuration - sourceOffset)),
  );
};

const clampMidiNotesToWindow = (
  notes: MidiNote[],
  windowStart: number,
  windowEnd: number,
  offset = 0,
) =>
  notes.flatMap((note) => {
    const noteStart = note.startTime;
    const noteEnd = note.startTime + note.duration;
    const clippedStart = Math.max(windowStart, noteStart);
    const clippedEnd = Math.min(windowEnd, noteEnd);

    if (clippedEnd <= clippedStart) {
      return [];
    }

    return [
      {
        ...note,
        id: createId(),
        startTime: Math.max(0, clippedStart - windowStart + offset),
        duration: Math.max(0.05, clippedEnd - clippedStart),
      },
    ];
  });

interface ProjectState {
  currentProject: Project | null;
  currentProjectId: string | null;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  isProjectModified: boolean;
  activeTool: ProjectTool;
  createProject: (name: string) => Project;
  loadProject: (project: Project) => void;
  clearProject: () => void;
  markSaved: () => void;
  updateProjectSettings: (
    updates: Partial<
      Pick<
        Project,
        "bpm" | "timeSignatureNumerator" | "timeSignatureDenominator"
      >
    >,
  ) => void;
  selectTrack: (trackId: string | null) => void;
  selectClip: (clipId: string | null) => void;
  setActiveTool: (tool: ProjectTool) => void;
  addMidiTrack: (name?: string) => void;
  addAudioTrack: (name?: string) => string | null;
  toggleTrackRecordArm: (trackId: string) => void;
  createRecordingMidiClip: (
    trackId: string,
    startTime: number,
  ) => string | null;
  appendNotesToClip: (
    trackId: string,
    clipId: string,
    notes: MidiNote[],
  ) => void;
  removeClip: (trackId: string, clipId: string) => void;
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
  moveClip: (trackId: string, clipId: string, startTime: number) => void;
  trimClip: (
    trackId: string,
    clipId: string,
    startTime: number,
    duration: number,
    trimMode: "start" | "end",
  ) => void;
  splitClip: (trackId: string, clipId: string, splitTime: number) => void;
  updateTrack: (
    trackId: string,
    updates: Partial<Omit<ProjectTrack, "id" | "type" | "clips">>,
  ) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  currentProjectId: null,
  selectedTrackId: null,
  selectedClipId: null,
  isProjectModified: false,
  activeTool: "pointer",

  createProject: (name) => {
    const project: Project = {
      id: createId(),
      name,
      projectSchemaVersion: PROJECT_SCHEMA_VERSION,
      bpm: 120,
      timeSignatureNumerator: 4,
      timeSignatureDenominator: 4,
      duration: 16,
      tracks: [],
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    set({
      currentProject: project,
      currentProjectId: project.id,
      selectedTrackId: null,
      selectedClipId: null,
      isProjectModified: true,
    });

    return project;
  },

  loadProject: (project) => {
    const migratedProject = migrateProjectSchema(project);
    const normalizedTracks: ProjectTrack[] = migratedProject.tracks.map((track, index) => {
      if (track.type === "audio") {
        return {
          ...track,
          trackColor: track.trackColor ?? pickTrackColor(index),
          recordArmed: track.recordArmed ?? false,
          clips: track.clips.map((clip) => ({
            ...clip,
            clipType: "audio" as const,
          })),
        };
      }

      return {
        ...track,
        trackColor: track.trackColor ?? pickTrackColor(index),
        recordArmed: track.recordArmed ?? false,
        clips: track.clips.map((clip) => ({
          ...clip,
          clipType: "midi" as const,
          notes: clip.notes ?? [],
        })),
      };
    });

    const normalizedProject: Project = {
      ...migratedProject,
      tracks: normalizedTracks,
    };

    set({
      currentProject: normalizedProject,
      currentProjectId: normalizedProject.id,
      selectedTrackId: normalizedProject.tracks[0]?.id ?? null,
      selectedClipId: null,
      isProjectModified: false,
    });
  },

  clearProject: () => {
    set({
      currentProject: null,
      currentProjectId: null,
      selectedTrackId: null,
      selectedClipId: null,
      isProjectModified: false,
    });
  },

  markSaved: () => {
    set({ isProjectModified: false });
  },

  updateProjectSettings: (updates) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      return {
        currentProject: touchProject({
          ...state.currentProject,
          ...updates,
        }),
        isProjectModified: true,
      };
    });
  },

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId, selectedClipId: null });
  },

  selectClip: (clipId) => {
    set({ selectedClipId: clipId });
  },

  setActiveTool: (tool) => {
    set({ activeTool: tool });
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
        selectedClipId: track.clips[0]?.id ?? null,
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
        selectedClipId: null,
        isProjectModified: true,
      };
    });

    return createdTrackId;
  },

  toggleTrackRecordArm: (trackId) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const nextTracks = state.currentProject.tracks.map((track) => {
        if (track.type !== "midi") {
          return {
            ...track,
            recordArmed: false,
          };
        }

        return {
          ...track,
          recordArmed: track.id === trackId ? !track.recordArmed : false,
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: nextTracks,
        }),
        selectedTrackId: trackId,
        isProjectModified: true,
      };
    });
  },

  createRecordingMidiClip: (trackId, startTime) => {
    let clipId: string | null = null;

    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const clip = createMidiClip(
        `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        Math.max(0, startTime),
      );
      clipId = clip.id;

      const nextTracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "midi") {
          return track;
        }

        return {
          ...track,
          clips: [...track.clips, clip].sort(
            (left, right) => left.startTime - right.startTime,
          ),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: nextTracks,
        }),
        selectedTrackId: trackId,
        selectedClipId: clip.id,
        isProjectModified: true,
      };
    });

    return clipId;
  },

  appendNotesToClip: (trackId, clipId, notes) => {
    if (notes.length === 0) {
      return;
    }

    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const nextTracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "midi") {
          return track;
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip;
            }

            const nextNotes = [...clip.notes, ...notes].sort(
              (left, right) => left.startTime - right.startTime,
            );
            const duration = nextNotes.reduce((maxDuration, note) => {
              return Math.max(maxDuration, note.startTime + note.duration);
            }, 0);

            return {
              ...clip,
              duration: Math.max(MIN_CLIP_DURATION, duration),
              notes: nextNotes,
            };
          }),
        };
      });

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: nextTracks,
        }),
        isProjectModified: true,
      };
    });
  },

  removeClip: (trackId, clipId) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const targetTrack = state.currentProject.tracks.find(
        (track) => track.id === trackId,
      );
      const removedClipIndex =
        targetTrack?.clips.findIndex((clip) => clip.id === clipId) ?? -1;

      if (!targetTrack || removedClipIndex === -1) {
        return state;
      }

      const nextTracks: ProjectTrack[] = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        if (track.type === "audio") {
          return {
            ...track,
            clips: track.clips.filter((clip) => clip.id !== clipId),
          };
        }

        return {
          ...track,
          clips: track.clips.filter((clip) => clip.id !== clipId),
        };
      });

      const nextTrack =
        nextTracks.find((track) => track.id === trackId) ?? null;
      const fallbackClip =
        nextTrack?.clips[
          Math.min(
            removedClipIndex,
            Math.max(0, (nextTrack?.clips.length ?? 1) - 1),
          )
        ] ?? null;
      const nextSelectedClipId =
        state.selectedClipId === clipId
          ? (fallbackClip?.id ?? null)
          : state.selectedClipId;

      const transportState = useTransportStore.getState();
      if (transportState.recordingClipId === clipId) {
        transportState.stopRecording();
      }

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: nextTracks,
        }),
        selectedClipId: nextSelectedClipId,
        isProjectModified: true,
      };
    });
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

      const tracks: ProjectTrack[] = projectState.currentProject.tracks.map((track) => {
        if (track.id !== trackId || track.type !== "audio") {
          return track;
        }

        const clip: AudioClip = {
          id: clipId,
          clipType: "audio",
          name: clipInput.name,
          startTime: clipInput.startTime,
          duration: analysis.duration,
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
        selectedClipId: clipId,
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

        const nextClips: AudioClip[] = [];

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

      const removedTrackIndex = state.currentProject.tracks.findIndex(
        (track) => track.id === trackId,
      );

      if (removedTrackIndex === -1) {
        return state;
      }

      const tracks = state.currentProject.tracks.filter(
        (track) => track.id !== trackId,
      );
      const fallbackTrack =
        tracks[Math.min(removedTrackIndex, Math.max(0, tracks.length - 1))] ??
        null;
      const nextSelectedTrackId =
        state.selectedTrackId === trackId
          ? (fallbackTrack?.id ?? null)
          : state.selectedTrackId;
      const nextSelectedClipId =
        state.selectedTrackId === trackId
          ? (fallbackTrack?.clips[0]?.id ?? null)
          : state.selectedClipId;

      const transportState = useTransportStore.getState();
      if (transportState.recordingTrackId === trackId) {
        transportState.stopRecording();
      }

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        selectedTrackId: nextSelectedTrackId,
        selectedClipId: nextSelectedClipId,
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
        selectedClipId: imported.tracks[0]?.clips[0]?.id ?? null,
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
        if (track.id !== trackId || track.type !== "midi") {
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

  moveClip: (trackId, clipId, startTime) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        if (track.type === "audio") {
          return {
            ...track,
            clips: track.clips
              .map((clip) =>
                clip.id === clipId
                  ? {
                      ...clip,
                      startTime: Math.max(0, startTime),
                    }
                  : clip,
              )
              .sort((left, right) => left.startTime - right.startTime),
          };
        }

        return {
          ...track,
          clips: track.clips
            .map((clip) =>
              clip.id === clipId
                ? {
                    ...clip,
                    startTime: Math.max(0, startTime),
                  }
                : clip,
            )
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

  trimClip: (trackId, clipId, startTime, duration, trimMode) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        if (track.type === "audio") {
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
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip;
            }

            if (trimMode === "start") {
              const nextStartTime = Math.max(
                0,
                Math.min(startTime, clip.startTime + clip.duration - 0.05),
              );
              const trimDelta = Math.max(0, nextStartTime - clip.startTime);
              const nextDuration = Math.max(0.05, duration);

              return {
                ...clip,
                startTime: nextStartTime,
                duration: nextDuration,
                notes: clampMidiNotesToWindow(
                  clip.notes,
                  trimDelta,
                  trimDelta + nextDuration,
                ),
              };
            }

            const nextDuration = Math.max(0.05, duration);
            return {
              ...clip,
              duration: nextDuration,
              notes: clampMidiNotesToWindow(clip.notes, 0, nextDuration),
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

  splitClip: (trackId, clipId, splitTime) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        if (track.type === "audio") {
          const nextClips: AudioClip[] = [];

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
            notes: clampMidiNotesToWindow(clip.notes, 0, relativeSplitTime),
          });

          nextClips.push({
            ...clip,
            id: createId(),
            startTime: splitTime,
            duration: clip.duration - relativeSplitTime,
            notes: clampMidiNotesToWindow(
              clip.notes,
              relativeSplitTime,
              clip.duration,
            ),
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
      }) as ProjectTrack[];

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
