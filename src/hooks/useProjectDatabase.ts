import { useCallback } from "react"
import Dexie from "dexie"
import type { Project, ProjectSummary } from "@/types"

class ProjectDatabase extends Dexie {
  projects!: Dexie.Table<Project, string>

  constructor() {
    super("BrowserDAWMvp")
    this.version(1).stores({
      projects: "id, name, createdAt, lastModified",
    })
    this.projects = this.table("projects")
  }
}

const db = new ProjectDatabase()

export const useProjectDatabase = () => {
  const saveProject = useCallback(async (project: Project) => {
    try {
      await db.projects.put({
        ...project,
        lastModified: Date.now(),
      })
      return true
    } catch (error) {
      console.error("Error saving project:", error)
      return false
    }
  }, [])

  const getProject = useCallback(async (id: string) => {
    try {
      return (await db.projects.get(id)) ?? null
    } catch (error) {
      console.error("Error getting project:", error)
      return null
    }
  }, [])

  const getProjectList = useCallback(async () => {
    try {
      const projects = await db.projects.toArray()
      const summaries: ProjectSummary[] = projects.map((project) => ({
        id: project.id,
        name: project.name,
        bpm: project.bpm,
        duration: project.duration,
        trackCount: project.tracks.length,
        createdAt: project.createdAt,
        lastModified: project.lastModified,
      }))

      return summaries.sort((a, b) => b.lastModified - a.lastModified)
    } catch (error) {
      console.error("Error getting project list:", error)
      return []
    }
  }, [])

  const deleteProject = useCallback(async (id: string) => {
    try {
      await db.projects.delete(id)
      return true
    } catch (error) {
      console.error("Error deleting project:", error)
      return false
    }
  }, [])

  return {
    saveProject,
    getProject,
    getProjectList,
    deleteProject,
  }
}