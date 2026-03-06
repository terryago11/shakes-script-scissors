"use client";

import { useEffect, use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useProject, loadProjectFromStorage } from "@/lib/project/ProjectStore";
import { exportProject, exportScriptHtml } from "@/lib/project/projectIO";
import type { Cut } from "@/types/project";
import type { Play } from "@/types/play";
import CutSelector from "@/components/CutSelector/CutSelector";
import SettingsModal from "@/components/SettingsModal/SettingsModal";
import { SceneJumpProvider, useSceneJump } from "@/lib/ui/SceneJumpContext";
import { CutModeProvider, useCutMode } from "@/lib/ui/CutModeContext";
import { MetricProvider } from "@/lib/ui/MetricContext";
import { ViewModeProvider, useViewMode, type ViewMode } from "@/lib/ui/ViewModeContext";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { project, activeCut, loadProject, dispatch } = useProject();
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
          <ViewModeProvider>
            <ProjectNav
              project={project}
              activeCut={activeCut}
              projectId={projectId}
              isScriptPage={isScriptPage}
              router={router}
              pathname={pathname}
              dispatch={dispatch}
            />
            <div className="flex-1">{children}</div>
          </ViewModeProvider>
        </MetricProvider>
      </CutModeProvider>
    </SceneJumpProvider>
  );
}

function ProjectNav({
  project,
  activeCut,
  projectId,
  isScriptPage,
  router,
  pathname,
  dispatch,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  activeCut: Cut | null;
  projectId: string;
  isScriptPage: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: React.Dispatch<any>;
}) {
  const { cutModeActive } = useCutMode();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleSettingsSave(updates: {
    name?: string;
    wordsPerMinute?: number;
    quickChangeThresholdMinutes?: number;
  }) {
    if (updates.name !== undefined) {
      dispatch({ type: "RENAME_PROJECT", name: updates.name });
    }
    if (updates.wordsPerMinute !== undefined || updates.quickChangeThresholdMinutes !== undefined) {
      dispatch({
        type: "UPDATE_SETTINGS",
        settings: {
          ...(updates.wordsPerMinute !== undefined ? { wordsPerMinute: updates.wordsPerMinute } : {}),
          ...(updates.quickChangeThresholdMinutes !== undefined
            ? { quickChangeThresholdMinutes: updates.quickChangeThresholdMinutes }
            : {}),
        },
      });
    }
  }

  const otherNavLinks = [
    { href: `/projects/${projectId}/dashboard`, label: "Dashboard" },
    { href: `/projects/${projectId}/casting`, label: "Casting" },
    { href: `/projects/${projectId}/export`, label: "Cue Scripts" },
  ];

  return (
    <header className="no-print border-b border-stone-200 bg-white sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm shrink-0">
          ✂ ShakesScriptScissors
        </Link>
        <div className="flex flex-col justify-center shrink-0 max-w-xs" title={project.name ? project.playTitle : undefined}>
          <span className="text-stone-700 font-semibold text-sm truncate leading-tight">
            {project.name || project.playTitle}
          </span>
          {project.name && project.playTitle && project.name !== project.playTitle && (
            <span className="text-stone-400 text-xs italic truncate leading-tight">
              {project.playTitle}
            </span>
          )}
        </div>

        <nav className="flex gap-1 shrink-0">
          {isScriptPage ? (
            <NavScriptMenu projectId={projectId} isActive />
          ) : (
            <Link
              href={`/projects/${projectId}`}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors text-stone-500 hover:text-stone-800 hover:bg-stone-100"
            >
              Script
            </Link>
          )}
          {otherNavLinks.map((link) => {
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

        {/* Script-page controls */}
        {isScriptPage && (
          <>
            <NavCutModeButton />
            <NavJumpSelect />
          </>
        )}

        <CutSelector />

        {/* Save / Export dropdown */}
        <SaveExportDropdown project={project} activeCut={activeCut} />

        {/* Settings gear */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="shrink-0 text-stone-400 hover:text-stone-700 text-base px-1.5 py-1 rounded hover:bg-stone-100 transition-colors"
          title="Project settings"
          aria-label="Open project settings"
        >
          ⚙
        </button>

        {settingsOpen && (
          <SettingsModal
            project={project}
            onSave={handleSettingsSave}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* Cut mode overlay */}
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

/** Save / Export dropdown — JSON save + HTML export */
function SaveExportDropdown({
  project,
  activeCut,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any;
  activeCut: Cut | null;
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleHtmlExport() {
    if (!activeCut) return;
    setOpen(false);
    setExporting(true);
    try {
      const r = await fetch(`/api/play/${project.playId}`);
      const play: Play = await r.json();
      exportScriptHtml(play, activeCut, project.name, project.actors, project.assignments);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={exporting}
        className="text-xs px-3 py-1.5 rounded border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 hover:border-stone-400 transition-colors font-medium flex items-center gap-1.5 disabled:opacity-60"
      >
        {exporting ? "Exporting…" : "Save / Export"}
        {!exporting && <span className="opacity-40">▾</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-50">
          <button
            onClick={() => { exportProject(project); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 flex items-center gap-2"
          >
            <span className="text-stone-400">↓</span>
            Save project as JSON
          </button>
          <button
            onClick={handleHtmlExport}
            disabled={!activeCut}
            className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 flex items-center gap-2 disabled:opacity-40"
          >
            <span className="text-stone-400">⊞</span>
            Export cut as HTML
          </button>
        </div>
      )}
    </div>
  );
}

/** Script nav item: link + view-mode dropdown + focus toggle */
function NavScriptMenu({ projectId, isActive }: { projectId: string; isActive: boolean }) {
  const { viewMode, setViewMode } = useViewMode();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const modeOptions: { value: ViewMode; icon: string; label: string; desc: string }[] = [
    { value: "standard", icon: "≡", label: "Standard", desc: "Strikethrough cuts" },
    { value: "clean",    icon: "✓", label: "Clean",    desc: "Hide cuts — final script only" },
    { value: "diff",     icon: "⊞", label: "Side by side", desc: "Modified left · Original right" },
  ];

  const currentIcon = modeOptions.find((m) => m.value === viewMode)?.icon ?? "≡";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
          isActive ? "bg-amber-100 text-amber-800" : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
        }`}
      >
        Script
        <span className="text-xs opacity-70">{currentIcon}</span>
        <span className="text-xs opacity-40">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 pt-1.5 pb-1 text-xs text-stone-400 uppercase tracking-wider font-semibold">
            View mode
          </div>
          {modeOptions.map(({ value, icon, label, desc }) => (
            <button
              key={value}
              onClick={() => { setViewMode(value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-start gap-2 ${
                viewMode === value ? "text-amber-800 bg-amber-50" : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              <span className="mt-0.5 w-4 shrink-0 text-center text-xs">{icon}</span>
              <span className="flex flex-col min-w-0">
                <span className={viewMode === value ? "font-semibold" : "font-medium"}>{label}</span>
                <span className="text-xs text-stone-400 font-normal">{desc}</span>
              </span>
              {viewMode === value && (
                <span className="ml-auto shrink-0 text-amber-500 text-xs mt-0.5">●</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

/** Condensed scene jump select — labels like "1:1", "2:3" */
function NavJumpSelect() {
  const { scenes, activeSceneId, setActiveSceneId, jumpToScene, focusedSceneId, setFocusedSceneId } = useSceneJump();
  if (scenes.length === 0) return null;

  const isFocused = !!focusedSceneId;

  function handleFocusToggle() {
    if (isFocused) {
      setFocusedSceneId(null);
    } else if (activeSceneId) {
      setFocusedSceneId(activeSceneId);
    }
  }

  const focusedLabel = isFocused
    ? scenes.find((s) => s.id === focusedSceneId)?.label ?? "?"
    : null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {isFocused ? (
        /* Locked label — no dropdown while a scene is focused */
        <span
          className="text-xs font-medium tabular-nums px-2 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700 w-16 text-center select-none"
          title="Scene jumper locked in focus mode"
        >
          {focusedLabel}
        </span>
      ) : (
        <select
          value={activeSceneId}
          onChange={(e) => { const val = e.target.value; if (val) { setActiveSceneId(val); jumpToScene(val); } }}
          className="text-xs px-2 py-1.5 border border-stone-200 rounded bg-white text-stone-600 hover:border-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-400 w-16"
        >
          <option value="">—</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      )}
      {/* Eye icon — focus/unfocus current scene */}
      <button
        onClick={handleFocusToggle}
        title={isFocused ? "Exit focus" : "Focus current scene"}
        className={`text-sm px-1.5 py-1 rounded border transition-colors ${
          isFocused
            ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
            : "border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-600"
        }`}
      >
        {isFocused ? "◉" : "○"}
      </button>
    </div>
  );
}
