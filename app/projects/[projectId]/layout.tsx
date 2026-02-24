"use client";

import { useEffect, use } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useProject, loadProjectFromStorage } from "@/lib/project/ProjectStore";
import { exportProject, encodeProjectForUrl } from "@/lib/project/projectIO";
import { useState } from "react";
import CutSelector from "@/components/CutSelector/CutSelector";
import { SceneJumpProvider, useSceneJump } from "@/lib/ui/SceneJumpContext";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { project, loadProject } = useProject();
  const pathname = usePathname();
  const [shareLabel, setShareLabel] = useState<"Share" | "Copied!" | "Too large!">("Share");

  async function handleShare() {
    if (!project) return;
    try {
      const encoded = await encodeProjectForUrl(project);
      const url = `${window.location.origin}/view?share=${encoded}`;
      if (url.length > 30_000) {
        setShareLabel("Too large!");
        setTimeout(() => setShareLabel("Share"), 2500);
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareLabel("Copied!");
      } catch {
        // Clipboard write failed (e.g. no focus) — show URL in prompt as fallback
        window.prompt("Copy this share link:", url);
        setShareLabel("Share");
        return;
      }
      setTimeout(() => setShareLabel("Share"), 2500);
    } catch {
      setShareLabel("Share");
    }
  }

  // Hydrate from localStorage if not already loaded (e.g. on page refresh)
  useEffect(() => {
    if (!project || project.id !== projectId) {
      const stored = loadProjectFromStorage(projectId);
      if (stored) loadProject(stored);
    }
  }, [projectId, project, loadProject]);

  if (!project || project.id !== projectId) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-400">
        Loading project…
      </div>
    );
  }

  const isScriptPage = pathname === `/projects/${projectId}`;

  const navLinks = [
    { href: `/projects/${projectId}`, label: "Script" },
    { href: `/projects/${projectId}/casting`, label: "Casting" },
    { href: `/projects/${projectId}/export`, label: "Cue Scripts" },
  ];

  return (
    <SceneJumpProvider>
      <div className="min-h-screen flex flex-col">
        {/* Top nav */}
        <header className="no-print border-b border-stone-200 bg-white sticky top-0 z-50">
          <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-4">
            <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm shrink-0">
              ✂ ShakesScriptScissors
            </Link>
            <span className="text-stone-700 font-semibold text-sm truncate max-w-xs shrink-0">
              {project.playTitle}
            </span>

            <nav className="flex gap-1 shrink-0">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-amber-100 text-amber-800"
                        : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Jump-to-scene — only visible on Script page, populated by ScriptEditor via context */}
            {isScriptPage && <NavJumpSelect />}

            <div className="ml-auto flex items-center gap-3 shrink-0">
              <CutSelector />
              <button
                onClick={handleShare}
                className="text-xs px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors"
                title="Copy a read-only share link to clipboard"
              >
                {shareLabel === "Copied!" ? "✓ Copied!" : shareLabel === "Too large!" ? "⚠ Too large!" : "🔗 Share"}
              </button>
              <button
                onClick={() => exportProject(project)}
                className="text-xs px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
              >
                Export JSON
              </button>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1">{children}</div>
      </div>
    </SceneJumpProvider>
  );
}

/** The jump-to-scene select that lives in the nav bar, reading from SceneJumpContext */
function NavJumpSelect() {
  const { scenes, activeSceneId, jumpToScene } = useSceneJump();

  if (scenes.length === 0) return null;

  return (
    <select
      value={activeSceneId}
      onChange={(e) => {
        const val = e.target.value;
        if (val) jumpToScene(val);
      }}
      className="text-xs px-2 py-1.5 border border-stone-200 rounded bg-white text-stone-600 hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[14rem]"
    >
      <option value="">— scene —</option>
      {scenes.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}
