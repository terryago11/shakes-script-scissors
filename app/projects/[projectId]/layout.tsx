"use client";

import { useEffect, use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useProject, loadProjectFromStorage } from "@/lib/project/ProjectStore";
import { exportProject, encodeProjectForUrl } from "@/lib/project/projectIO";
import CutSelector from "@/components/CutSelector/CutSelector";
import { SceneJumpProvider, useSceneJump } from "@/lib/ui/SceneJumpContext";
import { CutModeProvider, useCutMode } from "@/lib/ui/CutModeContext";
import { MetricProvider } from "@/lib/ui/MetricContext";

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

  return (
    <SceneJumpProvider>
      <CutModeProvider>
        <MetricProvider>
          <ProjectNav project={project} projectId={projectId} isScriptPage={isScriptPage} router={router} pathname={pathname} />
          <div className="flex-1">{children}</div>
        </MetricProvider>
      </CutModeProvider>
    </SceneJumpProvider>
  );
}

/** Extracted nav so it can use the CutMode + SceneJump contexts */
function ProjectNav({
  project,
  projectId,
  isScriptPage,
  router,
  pathname,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  projectId: string;
  isScriptPage: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
  pathname: string;
}) {
  const { cutModeActive } = useCutMode();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState<"Share" | "Copied!" | "Too large!">("Share");
  const toolsRef = useRef<HTMLDivElement>(null);

  // Close tools dropdown when clicking outside
  useEffect(() => {
    if (!toolsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [toolsOpen]);

  async function handleShare() {
    if (!project) return;
    try {
      const encoded = await encodeProjectForUrl(project);
      const url = `${window.location.origin}/view?share=${encoded}`;
      if (url.length > 30_000) {
        setShareLabel("Too large!");
        setTimeout(() => setShareLabel("Share"), 2500);
        setToolsOpen(false);
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareLabel("Copied!");
      } catch {
        window.prompt("Copy this share link:", url);
        setShareLabel("Share");
        setToolsOpen(false);
        return;
      }
      setTimeout(() => setShareLabel("Share"), 2500);
      setToolsOpen(false);
    } catch {
      setShareLabel("Share");
    }
  }

  const navLinks = [
    { href: `/projects/${projectId}`, label: "Script" },
    { href: `/projects/${projectId}/casting`, label: "Casting" },
    { href: `/projects/${projectId}/export`, label: "Cue Scripts" },
  ];

  return (
    <header className="no-print border-b border-stone-200 bg-white sticky top-0 z-50 min-h-screen-0">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">
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

        {/* Cut mode button + scene jumper — script page only */}
        {isScriptPage && (
          <>
            <NavCutModeButton />
            <NavJumpSelect />
          </>
        )}

        <CutSelector />

        {/* Tools dropdown */}
        <div ref={toolsRef} className="ml-auto relative shrink-0">
          <button
            onClick={() => setToolsOpen((o) => !o)}
            className="text-xs px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-1"
          >
            Tools {toolsOpen ? "▴" : "▾"}
          </button>
          {toolsOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={handleShare}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {shareLabel === "Copied!" ? "✓ Copied!" : shareLabel === "Too large!" ? "⚠ Too large!" : "🔗 Share link"}
              </button>
              <button
                onClick={() => { exportProject(project); setToolsOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
              >
                ↓ Export JSON
              </button>
              <div className="my-1 border-t border-stone-100" />
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
                className="w-full text-left px-4 py-2 text-sm text-stone-400 hover:bg-stone-50 hover:text-stone-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cut mode active: red bar replaces the nav visually */}
      {cutModeActive && (
        <div className="absolute inset-0 bg-red-600 flex items-center px-6 gap-4">
          <span className="text-white font-semibold text-sm">✂ Cut mode</span>
          <span className="text-red-200 text-sm">Drag to select text — release to cut. Spans speeches freely.</span>
          <NavCutModeExitButton />
        </div>
      )}
    </header>
  );
}

/** Cut mode toggle button in the nav */
function NavCutModeButton() {
  const { cutModeActive, setCutModeActive } = useCutMode();
  if (cutModeActive) return null;
  return (
    <button
      onClick={() => setCutModeActive(true)}
      className="text-xs px-3 py-1.5 rounded border border-stone-200 bg-white text-stone-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors shrink-0"
      title="Enter freestyle cut mode"
    >
      ✂ Cut mode
    </button>
  );
}

/** Exit button rendered inside the cut mode overlay */
function NavCutModeExitButton() {
  const { setCutModeActive } = useCutMode();
  return (
    <button
      onClick={() => setCutModeActive(false)}
      className="ml-auto text-sm text-red-100 hover:text-white border border-red-400 hover:border-red-200 px-3 py-1 rounded transition-colors"
    >
      Exit (Esc)
    </button>
  );
}

/** Jump-to-scene select in the nav bar */
function NavJumpSelect() {
  const { scenes, activeSceneId, jumpToScene } = useSceneJump();
  if (scenes.length === 0) return null;
  return (
    <select
      value={activeSceneId}
      onChange={(e) => { const val = e.target.value; if (val) jumpToScene(val); }}
      className="text-xs px-2 py-1.5 border border-stone-200 rounded bg-white text-stone-600 hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[14rem]"
    >
      <option value="">— scene —</option>
      {scenes.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  );
}
