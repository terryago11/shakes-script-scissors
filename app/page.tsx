"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProject, listProjectsFromApi, type ProjectSummary } from "@/lib/project/ProjectStore";
import { importProjectFromFile } from "@/lib/project/projectIO";
import type { PlayMeta } from "@/lib/folger/FolgerClient";

export default function HomePage() {
  const router = useRouter();
  const { createProject, loadProject } = useProject();
  const [plays, setPlays] = useState<PlayMeta[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [storedProjects, setStoredProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    fetch("/api/plays")
      .then((r) => r.json())
      .then((data: PlayMeta[]) => {
        setPlays(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    listProjectsFromApi().then(setStoredProjects);
  }, []);

  const filtered = plays.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelectPlay(play: PlayMeta) {
    const project = await createProject(play.id, play.title);
    router.push(`/projects/${project.id}`);
  }

  async function handleImport() {
    setImportError(null);
    try {
      const project = await importProjectFromFile();
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      loadProject(project);
      router.push(`/projects/${project.id}`);
    } catch (e) {
      if (e instanceof Error && e.message !== "Cancelled") {
        setImportError(e.message);
      }
    }
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
          className="px-4 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 text-sm font-medium"
        >
          Open existing project…
        </button>
        {importError && (
          <span className="text-red-600 text-sm self-center">{importError}</span>
        )}
      </div>

      {storedProjects.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-stone-700 mb-4">
            Recent projects
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {storedProjects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => router.push(`/projects/${p.id}`)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-amber-50 hover:border-amber-300 transition-colors"
                >
                  <div className="text-stone-800 text-sm font-medium">{p.playTitle}</div>
                  <div className="text-stone-400 text-xs mt-0.5">
                    Last saved {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </button>
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
                className="w-full text-left px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-amber-50 hover:border-amber-300 transition-colors text-stone-800 text-sm font-medium"
              >
                {play.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
