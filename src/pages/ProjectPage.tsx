import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, FileUp, Plus, Save } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import MidiPianoRoll from "@/components/editor/MidiPianoRoll"
import TransportBar from "@/components/transport/TransportBar"
import { useAudioEngine } from "@/hooks/useAudioEngine"
import { useProjectDatabase } from "@/hooks/useProjectDatabase"
import { useProjectStore } from "@/stores/projectStore"

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const {
    addMidiTrack,
    currentProject,
    currentProjectId,
    importMidiFile,
    loadProject,
    markSaved,
    removeTrack,
    selectTrack,
    selectedTrackId,
  } = useProjectStore()
  const { getProject, saveProject } = useProjectDatabase()
  useAudioEngine()

  useEffect(() => {
    if (!id) {
      navigate("/")
      return
    }

    if (currentProject && currentProjectId === id) {
      return
    }

    const loadProjectData = async () => {
      const project = await getProject(id)
      if (project) {
        loadProject(project)
      } else {
        setStatusMessage("Project not found. Return home and create a new one.")
      }
    }

    void loadProjectData()
  }, [currentProject, currentProjectId, getProject, id, loadProject, navigate])

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  const selectedTrack = useMemo(() => {
    return currentProject?.tracks.find((track) => track.id === selectedTrackId) ?? currentProject?.tracks[0] ?? null
  }, [currentProject, selectedTrackId])

  const selectedClip = selectedTrack?.clips[0] ?? null

  const handleSave = async () => {
    if (!currentProject) {
      return
    }

    setIsBusy(true)
    const isSaved = await saveProject(currentProject)
    setIsBusy(false)
    setStatusMessage(isSaved ? "Project saved." : "Project could not be saved.")
    if (isSaved) {
      markSaved()
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsBusy(true)
    setStatusMessage(`Importing ${file.name}...`)
    try {
      await importMidiFile(file)
      setStatusMessage(`${file.name} imported successfully.`)
    } catch (error) {
      console.error(error)
      setStatusMessage("MIDI import failed.")
    } finally {
      setIsBusy(false)
      event.target.value = ""
    }
  }

  if (!currentProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <div className="text-center">
            <p className="font-medium text-slate-200">Loading project...</p>
            {statusMessage && <p className="mt-1 text-xs text-slate-500">{statusMessage}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur-md z-10">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="group flex items-center justify-center rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-cyan-300"
            title="Back to projects"
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
          </Link>
          <div>
            <h1 className="text-base font-semibold leading-tight text-slate-200 tracking-tight">{currentProject.name}</h1>
            <p className="text-[11px] text-slate-500 font-medium">
              {currentProject.tracks.length} tracks • {currentProject.bpm} BPM • {currentProject.duration.toFixed(1)}s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusMessage && (
            <span className="mr-4 animate-in fade-in slide-in-from-right-2 text-xs text-cyan-400/80 font-medium tracking-wide">
              {statusMessage}
            </span>
          )}
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-slate-700/60 bg-slate-800/50 px-3 text-xs font-medium text-slate-300 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 active:scale-95"
            onClick={() => addMidiTrack()}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Track
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-slate-700/60 bg-slate-800/50 px-3 text-xs font-medium text-slate-300 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300 active:scale-95"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="mr-1.5 h-3.5 w-3.5" />
            Import MIDI
          </button>
          <div className="mx-2 h-4 w-px bg-slate-700" />
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md bg-cyan-500/10 px-4 text-xs font-medium text-cyan-400 ring-1 ring-inset ring-cyan-500/20 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => void handleSave()}
            disabled={isBusy}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            Save
          </button>
          <input ref={fileInputRef} type="file" accept=".mid,.midi,audio/midi" className="hidden" onChange={handleImport} />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15} maxSize={30} className="flex flex-col border-r border-slate-800 bg-[#0B0F19]">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800/50 px-4 bg-slate-900/30">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracks</h2>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
              {currentProject.tracks.length === 0 ? (
                <div className="mx-2 mt-4 rounded-lg border border-dashed border-slate-800/60 p-4 text-center text-xs text-slate-500">
                  <p>Add a track to start</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {currentProject.tracks.map((track, index) => {
                    const isSelected = track.id === selectedTrack?.id
                    return (
                      <div
                        key={track.id}
                        className={`group cursor-pointer w-full rounded-md border px-3 py-2.5 text-left transition-all ${isSelected ? "border-cyan-500/40 bg-cyan-500/15 shadow-[0_0_15px_rgba(34,211,238,0.05)]" : "border-transparent hover:bg-slate-800/60 hover:border-slate-700/50"}`}
                        onClick={() => selectTrack(track.id)}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`truncate text-sm font-semibold tracking-tight ${isSelected ? "text-cyan-50" : "text-slate-300 group-hover:text-slate-200"}`}>{track.name}</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold transition-all ${track.muted ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300"}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().updateTrack(track.id, { muted: !track.muted })
                              }}
                              title="Mute"
                            >
                              M
                            </button>
                            <button
                              type="button"
                              className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold transition-all ${track.solo ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300"}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                useProjectStore.getState().updateTrack(track.id, { solo: !track.solo })
                              }}
                              title="Solo"
                            >
                              S
                            </button>
                            <button
                              type="button"
                              className="shrink-0 p-1 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation()
                                removeTrack(track.id)
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                          </div>
                        </div>
                        <p className={`mt-0.5 truncate text-[10px] ${isSelected ? "text-cyan-200/60" : "text-slate-500"}`}>{track.instrument.patchId || track.instrument.type}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle className="group relative w-1 outline-none bg-slate-900 z-10">
            <div className="absolute inset-y-0 -inset-x-1.5 cursor-col-resize transition-colors group-hover:bg-cyan-500/30 group-active:bg-cyan-500/50" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-slate-700 group-hover:bg-cyan-400 opacity-50 transition-colors" />
          </PanelResizeHandle>

          <Panel defaultSize={60} minSize={30} className="flex flex-col bg-[#080B12]">
            <MidiPianoRoll track={selectedTrack} clip={selectedClip} duration={currentProject.duration} bpm={currentProject.bpm} />
          </Panel>

          <PanelResizeHandle className="group relative w-1 outline-none bg-slate-900 z-10">
            <div className="absolute inset-y-0 -inset-x-1.5 cursor-col-resize transition-colors group-hover:bg-cyan-500/30 group-active:bg-cyan-500/50" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-slate-700 group-hover:bg-cyan-400 opacity-50 transition-colors" />
          </PanelResizeHandle>

          <Panel defaultSize={20} minSize={15} maxSize={30} className="flex flex-col border-l border-slate-800 bg-[#0B0F19]">
            <div className="flex h-10 shrink-0 items-center border-b border-slate-800/50 px-4 bg-slate-900/30">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inspector</h2>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
              {selectedTrack ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <div className="h-px flex-1 bg-slate-800/60"></div>
                      Track Properties
                      <div className="h-px flex-1 bg-slate-800/60"></div>
                    </h3>
                    <dl className="space-y-2">
                      <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                        <dt className="text-xs text-slate-500">Instrument</dt>
                        <dd className="text-xs font-semibold text-slate-200">{selectedTrack.instrument.patchId || selectedTrack.instrument.type}</dd>
                      </div>
                      <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                        <dt className="text-xs text-slate-500">Volume</dt>
                        <dd className="text-xs font-semibold text-cyan-100">{Math.round(selectedTrack.volume * 100)}%</dd>
                      </div>
                      <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                        <dt className="text-xs text-slate-500">Pan</dt>
                        <dd className="text-xs font-semibold text-slate-200">{selectedTrack.pan}</dd>
                      </div>
                    </dl>
                  </div>
                  
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <div className="h-px flex-1 bg-slate-800/60"></div>
                      Clip Info
                      <div className="h-px flex-1 bg-slate-800/60"></div>
                    </h3>
                    <dl className="space-y-2">
                      <div className="group flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/40 px-3 py-2.5 transition-colors hover:bg-slate-800/40">
                        <dt className="text-xs text-slate-500">Notes</dt>
                        <dd className="text-xs font-semibold text-slate-200">{selectedClip?.notes.length ?? 0}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="mt-8 text-center text-xs text-slate-500">Select a track to inspect it.</div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div className="shrink-0 border-t border-slate-800 bg-[#0F1423] shadow-[0_-10px_40px_rgba(0,0,0,0.3)] z-20">
        <TransportBar duration={currentProject.duration} />
      </div>
    </div>
  )
}

export default ProjectPage