import { useProjectStore } from "@/stores/projectStore"
import { useToast } from "@/components/ui/use-toast"
import MidiTrack from "./MidiTrack"
import AudioTrack from "./AudioTrack"

interface TrackListProps {
  readOnly?: boolean
}

const TrackList = ({ readOnly = false }: TrackListProps) => {
  const { currentProject, importMidiFile } = useProjectStore()
  const { toast } = useToast()

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    const midiFile = files.find(file => file.type === "audio/midi" || file.name.endsWith('.mid') || file.name.endsWith('.midi'))

    if (midiFile) {
      try {
        await importMidiFile(midiFile)
        toast({
          title: "MIDI imported",
          description: `${midiFile.name} has been imported successfully.`,
        })
      } catch (error) {
        toast({
          title: "Import failed",
          description: "There was an error importing the MIDI file.",
          variant: "destructive",
        })
      }
    } else {
      toast({
        title: "Invalid file",
        description: "Please drop a valid MIDI file (.mid or .midi).",
        variant: "destructive",
      })
    }
  }

  if (!currentProject || !currentProject.tracks || currentProject.tracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No tracks. Add a track to get started.
      </div>
    )
  }

  return (
    <div className="flex flex-col" onDragOver={handleDragOver} onDrop={handleDrop}>
      {currentProject.tracks.map((track) => (
        <div key={track.id} className="border-b border-border">
          {track.type === "midi" ? (
            <MidiTrack track={track} readOnly={readOnly} />
          ) : (
            <AudioTrack track={track} readOnly={readOnly} />
          )}
        </div>
      ))}
    </div>
  )
}

export default TrackList
