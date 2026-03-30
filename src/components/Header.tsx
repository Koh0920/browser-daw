"use client"

import { Link } from "react-router-dom"
import { Home, Settings, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjectStore } from "@/stores/projectStore"
import { useShareProject } from "@/hooks/useShareProject"
import { ModeToggle } from "./ModeToggle"

const Header = () => {
  const { currentProject, isProjectModified } = useProjectStore()
  const { shareProject } = useShareProject()

  const handleShare = async () => {
    if (currentProject) {
      await shareProject(currentProject)
    }
  }

  return (
    <header className="border-b border-border">
      <div className="container flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-bold text-xl">WebDAW</span>
          </Link>
          {currentProject && (
            <span className="text-sm text-muted-foreground">
              {currentProject.name} {isProjectModified && "*"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentProject && (
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
          <Link to="/">
            <Button variant="ghost" size="icon">
              <Home className="h-5 w-5" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}

export default Header
