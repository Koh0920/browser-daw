import { useEffect, useRef, useState } from "react";
import { FileUp, Folder, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ProjectSummary } from "@/types";
import { importDawProjectArchive } from "@/utils/dawprojectImport";
import { useProjectDatabase } from "@/hooks/useProjectDatabase";
import { useProjectStore } from "@/stores/projectStore";

const HomePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { createProject, loadProject } = useProjectStore();
  const { deleteProject, getProjectList, saveProject } = useProjectDatabase();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectName, setProjectName] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      setProjects(await getProjectList());
    };

    void loadProjects();
  }, [getProjectList]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      return;
    }

    const project = createProject(projectName.trim());
    setProjectName("");
    setIsCreateModalOpen(false);

    const isSaved = await saveProject(project);
    if (!isSaved) {
      setErrorMessage("Project could not be saved locally.");
    }

    navigate(`/project/${project.id}`);
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );
  };

  const handleImportDawProject = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const importedProject = await importDawProjectArchive(file);
      loadProject(importedProject);

      const isSaved = await saveProject(importedProject);
      if (!isSaved) {
        throw new Error("Imported project could not be saved locally.");
      }

      navigate(`/project/${importedProject.id}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(".dawproject import failed.");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 flex items-end justify-between gap-6 border-b border-slate-800 pb-6">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.3em] text-cyan-300">
              Rebuild MVP
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              Browser DAW
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-400">
              Vite-based rebuild focused on project creation, MIDI import, local
              persistence, and a stable editing shell.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-400 hover:text-cyan-200 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <FileUp className="mr-2 h-4 w-4" />
            Import .dawproject
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dawproject,.zip,application/zip"
            className="hidden"
            onChange={handleImportDawProject}
          />
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {errorMessage}
          </div>
        )}

        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-5">
                <h2 className="text-xl font-semibold">Create Project</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Create a local project and open the new DAW shell.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateProject();
                }}
              >
                <div className="mb-5">
                  <label
                    htmlFor="project-name"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Project name
                  </label>
                  <input
                    id="project-name"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="My first sketch"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-400"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setIsCreateModalOpen(false);
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 px-6 py-32 text-center transition-all hover:bg-slate-900">
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-slate-950/50 ring-1 ring-slate-800 transition-transform duration-500 group-hover:scale-110 group-hover:ring-cyan-500/30">
              <Plus className="h-8 w-8 text-cyan-400 opacity-80" />
            </div>
            <h2 className="relative z-10 mt-6 text-xl font-semibold text-slate-200">
              No projects yet
            </h2>
            <p className="relative z-10 mt-2 max-w-sm text-sm text-slate-400">
              Get started by creating your first project. You'll be able to
              import MIDI sequences and build your arrangement.
            </p>
            <div className="relative z-10 mt-8 flex gap-3">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-6 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
              >
                Create New Project
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-6 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
                disabled={isImporting}
              >
                Import .dawproject
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <Folder className="h-5 w-5 text-cyan-300" />
                      {project.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {project.trackCount} tracks • {project.bpm} BPM
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 p-2 text-slate-400 transition hover:border-red-400 hover:text-red-300"
                    onClick={() => void handleDeleteProject(project.id)}
                    aria-label={`Delete ${project.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm text-slate-400">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Created
                    </dt>
                    <dd>{new Date(project.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Modified
                    </dt>
                    <dd>{new Date(project.lastModified).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Duration
                    </dt>
                    <dd>{project.duration.toFixed(1)} sec</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="mt-5 inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-400 hover:text-cyan-200"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  Open Project
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
