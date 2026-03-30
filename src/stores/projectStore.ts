import { create } from "zustand"
import type { MidiNote, Project, ProjectTrack } from "@/types"
import { parseMidiFile } from "@/utils/midiImport"

const createId = () => crypto.randomUUID()

const touchProject = (project: Project): Project => ({
  ...project,
  lastModified: Date.now(),
})

interface ProjectState {
  currentProject: Project | null
  currentProjectId: string | null
  selectedTrackId: string | null
  isProjectModified: boolean
  createProject: (name: string) => Project
  loadProject: (project: Project) => void
  clearProject: () => void
  markSaved: () => void
  selectTrack: (trackId: string | null) => void
  addMidiTrack: (name?: string) => void
  removeTrack: (trackId: string) => void
  importMidiFile: (file: File) => Promise<void>
  replaceClipNotes: (trackId: string, clipId: string, notes: MidiNote[]) => void
  updateTrack: (trackId: string, updates: Partial<ProjectTrack>) => void
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
    }

    set({
      currentProject: project,
      currentProjectId: project.id,
      selectedTrackId: null,
      isProjectModified: true,
    })

    return project
  },

  loadProject: (project) => {
    set({
      currentProject: project,
      currentProjectId: project.id,
      selectedTrackId: project.tracks[0]?.id ?? null,
      isProjectModified: false,
    })
  },

  clearProject: () => {
    set({
      currentProject: null,
      currentProjectId: null,
      selectedTrackId: null,
      isProjectModified: false,
    })
  },

  markSaved: () => {
    set({ isProjectModified: false })
  },

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId })
  },

  addMidiTrack: (name) => {
    set((state) => {
      if (!state.currentProject) {
        return state
      }

      const track: ProjectTrack = {
        id: createId(),
        name: name || `MIDI Track ${state.currentProject.tracks.length + 1}`,
        type: "midi",
        clips: [
          {
            id: createId(),
            name: "Default Clip",
            startTime: 0,
            duration: state.currentProject.duration,
            notes: [],
          }
        ],
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        instrument: {
          type: "oscillator",
          parameters: { 
            gain: 1.0,
            oscType: "triangle"
          },
        },
      }

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks: [...state.currentProject.tracks, track],
        }),
        selectedTrackId: track.id,
        isProjectModified: true,
      }
    })
  },

  removeTrack: (trackId) => {
    set((state) => {
      if (!state.currentProject) {
        return state
      }

      const tracks = state.currentProject.tracks.filter((track) => track.id !== trackId)

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        selectedTrackId: tracks[0]?.id ?? null,
        isProjectModified: true,
      }
    })
  },

  importMidiFile: async (file) => {
    const imported = await parseMidiFile(file)

    set((state) => {
      if (!state.currentProject) {
        return state
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
      }
    })
  },

  replaceClipNotes: (trackId, clipId, notes) => {
    set((state) => {
      if (!state.currentProject) {
        return state
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip
            }

            const duration = notes.reduce((maxDuration, note) => {
              return Math.max(maxDuration, note.startTime + note.duration)
            }, 0)

            return {
              ...clip,
              duration,
              notes,
            }
          }),
        }
      })

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      }
    })
  },

  updateTrack: (trackId, updates) => {
    set((state) => {
      if (!state.currentProject) {
        return state
      }

      const tracks = state.currentProject.tracks.map((track) => {
        if (track.id !== trackId) {
          return track
        }

        return {
          ...track,
          ...updates,
        }
      })

      return {
        currentProject: touchProject({
          ...state.currentProject,
          tracks,
        }),
        isProjectModified: true,
      }
    })
  },
}))