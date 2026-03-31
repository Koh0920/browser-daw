import { useCallback } from "react"
import { useToast } from "@/components/ui/use-toast"
import type { Project } from "@/types"
import { encodeSharedProject } from "@/utils/projectSharing"

export const useShareProject = () => {
  const { toast } = useToast()

  const shareProject = useCallback(
    async (project: Project) => {
      try {
        // Encode project data
        const encodedData = encodeSharedProject(project)

        // Create shareable URL
        const baseUrl = window.location.origin
        const shareUrl = `${baseUrl}/#/shared/${encodedData}`

        // Copy to clipboard
        await navigator.clipboard.writeText(shareUrl)

        toast({
          title: "Share link copied!",
          description: "The project share link has been copied to your clipboard.",
        })

        return shareUrl
      } catch (error) {
        console.error("Error sharing project:", error)

        toast({
          title: "Share failed",
          description: "There was an error creating the share link.",
          variant: "destructive",
        })

        return null
      }
    },
    [toast],
  )

  return {
    shareProject,
  }
}
