"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProject, listStoredProjectIds, loadProjectFromStorage, type ProjectSummary } from "@/lib/project/ProjectStore";
import { importProjectFromFile, exportProject } from "@/lib/project/projectIO";
import type { PlayMeta } from "@/lib/folger/FolgerClient";

export default function HomePage() {
  const router = useRouter();
  const { createProject, loadProject } = useProject();
  const [plays, setPlays] = useState<PlayMeta[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [storedProjects, setStoredProjects] = useState<ProjectSummary[]>([]);

  // Pending-play modal state
  const [pendingPlay, setPendingPlay] = useState<PlayMeta | null>(null);
  const [projectName, setProjectName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Clear-all confirmation state
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    fetch("/api/plays")
      .then((r) => r.json())
      .then((data: PlayMeta[]) => {
        setPlays(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    refreshProjects();
  }, []);

  function refreshProjects() {
    const ids = listStoredProjectIds();
    const summaries: ProjectSummary[] = ids
      .map((id) => loadProjectFromStorage(id))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => ({ id: p.id, playId: p.playId, playTitle: p.playTitle, name: p.name, updatedAt: p.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setStoredProjects(summaries);
  }

  const filtered = plays.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelectPlay(play: PlayMeta) {
    setPendingPlay(play);
    setProjectName(play.title);
    setTimeout(() => nameInputRef.current?.select(), 50);
  }

  function handleConfirmCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPlay) return;
    const name = projectName.trim() || pendingPlay.title;
    const project = createProject(pendingPlay.id, pendingPlay.title, name);
    router.push(`/projects/${project.id}`);
  }

  function handleCancelCreate() {
    setPendingPlay(null);
    setProjectName("");
  }

  async function handleImport() {
    setImportError(null);
    try {
      const project = await importProjectFromFile();
      loadProject(project);
      router.push(`/projects/${project.id}`);
    } catch (e) {
      if (e instanceof Error && e.message !== "Cancelled") {
        setImportError(e.message);
      }
    }
  }

  function handleClearAll() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("sss_"));
    keys.forEach((k) => localStorage.removeItem(k));
    setStoredProjects([]);
    setClearConfirm(false);
  }

  function handleSaveProject(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const project = loadProjectFromStorage(projectId);
    if (project) exportProject(project);
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-stone-800 mb-2">
          ✂ ShakesScriptScissors
        </h1>
        <p className="text-stone-500 text-lg">
          Cut Shakespeare scripts, track line counts, generate cue scripts.
        </p>
      </div>

      <div className="flex gap-3 mb-8">
        <button
          onClick={handleImport}
          className="px-4 py-2 rounded-lg border border-stone-400 bg-white text-stone-700 hover:bg-stone-50 text-sm font-semibold shadow-sm"
        >
          ↑ Open Project
        </button>
        {importError && (
          <span className="text-red-600 text-sm self-center">{importError}</span>
        )}
      </div>

      {storedProjects.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-stone-700">
              Locally Cached Projects
            </h2>
            {/* Clear local cache — two-step confirm */}
            {clearConfirm ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">Delete all local data?</span>
                <button
                  onClick={handleClearAll}
                  className="px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setClearConfirm(false)}
                  className="px-2 py-0.5 rounded bg-stone-100 text-stone-500 hover:bg-stone-200"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setClearConfirm(true)}
                className="text-xs text-stone-400 hover:text-red-500 transition-colors"
              >
                Delete local cache
              </button>
            )}
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {storedProjects.map((p) => (
              <li key={p.id}>
                <div className="flex rounded-lg border border-stone-200 bg-white overflow-hidden hover:border-amber-300 transition-colors group">
                  {/* Main open area */}
                  <button
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="flex-1 text-left px-4 py-3 hover:bg-amber-50 transition-colors"
                  >
                    <div className="text-stone-800 text-sm font-medium">
                      {p.name || p.playTitle}
                    </div>
                    {p.name && p.name !== p.playTitle && (
                      <div className="text-stone-400 text-xs">{p.playTitle}</div>
                    )}
                    <div className="text-stone-400 text-xs mt-0.5">
                      Last saved {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  {/* Save button */}
                  <button
                    onClick={(e) => handleSaveProject(p.id, e)}
                    className="shrink-0 px-3 border-l border-stone-200 text-stone-400 hover:bg-stone-50 hover:text-stone-600 transition-colors text-xs flex flex-col items-center justify-center gap-0.5"
                    title="Save project file"
                  >
                    <span className="text-base leading-none">↓</span>
                    <span>Save</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="text-xl font-semibold text-stone-700 mb-4">
        Start a new project — choose a play
      </h2>

      <input
        type="search"
        placeholder="Search plays…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      {loading ? (
        <div className="text-stone-400 text-sm">Loading plays…</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((play) => (
            <li key={play.id}>
              <button
                onClick={() => handleSelectPlay(play)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  pendingPlay?.id === play.id
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-stone-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-stone-800"
                }`}
              >
                {play.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Attribution footer */}
      <footer className="mt-16 pt-6 border-t border-stone-200 text-xs text-stone-400 space-y-1">
        <p>
          Shakespeare texts are provided by{" "}
          <a
            href="https://dracor.org/shake"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-600"
          >
            DraCor
          </a>{" "}
          and are based on the{" "}
          <a
            href="https://www.folger.edu/explore/shakespeares-works/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-600"
          >
            Folger Shakespeare editions
          </a>
          , edited by Barbara Mowat, Paul Werstine, Michael Poston, and Rebecca Niles.
          Licensed{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-600"
          >
            CC BY-SA 4.0
          </a>
          .
        </p>
        <p>
          ShakesScriptScissors is an open-source tool for production dramaturgy.
          Built with{" "}
          <a
            href="https://nextjs.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-600"
          >
            Next.js
          </a>
          .
        </p>
      </footer>

      {/* New project name modal */}
      {pendingPlay && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={handleCancelCreate}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800 mb-1">New project</h3>
            <p className="text-sm text-stone-500 mb-4">
              {pendingPlay.title}
            </p>
            <form onSubmit={handleConfirmCreate}>
              <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                Project name
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={pendingPlay.title}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors"
                >
                  Create project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
