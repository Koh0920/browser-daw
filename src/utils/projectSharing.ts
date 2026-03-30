import type { Project } from "@/types"

// Encode project data for sharing
export const encodeSharedProject = (project: Project): string => {
  // Create a simplified version of the project for sharing
  const sharedProject: Project = {
    ...project,
    // Process tracks to reduce size
    tracks: project.tracks.map((track) => {
      if (track.type === "audio") {
        // For audio tracks, we need to keep the audio data
        return {
          ...track,
          clips: track.clips.map((clip) => ({
            ...clip,
            // Keep audio data for sharing
            audioData: clip.audioData,
          })),
        }
      }
      return track
    }),
  }

  // Convert to JSON and compress
  const jsonString = JSON.stringify(sharedProject)

  // Base64 encode
  return btoa(jsonString)
}

// Decode shared project data
export const decodeSharedProject = (encodedData: string): Project => {
  try {
    // Base64 decode
    const jsonString = atob(encodedData)

    // Parse JSON
    const project = JSON.parse(jsonString) as Project

    return project
  } catch (error) {
    console.error("Error decoding shared project:", error)
    throw new Error("Invalid shared project data")
  }
}
