"use client";

import { useEffect, use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useProject, loadProjectFromStorage } from "@/lib/project/ProjectStore";
import { exportProject, exportScriptHtml } from "@/lib/project/projectIO";
import type { Cut } from "@/types/project";
import type { Play } from "@/types/play";
import SettingsModal from "@/components/SettingsModal/SettingsModal";
import ShakespeareAnimation from "@/components/EasterEgg/ShakespeareAnimation";
import { SceneJumpProvider, useSceneJump } from "@/lib/ui/SceneJumpContext";
import { EditModeProvider, useEditMode, type EditTool } from "@/lib/ui/EditModeContext";
import { MetricProvider } from "@/lib/ui/MetricContext";
import { ViewModeProvider, useViewMode, type ViewMode } from "@/lib/ui/ViewModeContext";
import { SearchProvider, useSearch } from "@/lib/ui/SearchContext";

// ─── Nav icons ────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function ScriptIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function CastingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function CueScriptIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-center min-h-screen text-stone-400 dark:text-stone-400">
        Loading project…
      </div>
    );
  }

  const isScriptPage = pathname === `/projects/${projectId}`;

  return (
    <SceneJumpProvider>
      <EditModeProvider>
        <MetricProvider>
          <ViewModeProvider>
            <SearchProvider>
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
            </SearchProvider>
          </ViewModeProvider>
        </MetricProvider>
      </EditModeProvider>
    </SceneJumpProvider>
  );
}

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
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
  const { activeTool, setActiveTool } = useEditMode();
  const isDashboard = pathname.startsWith(`/projects/${projectId}/dashboard`);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const [showSaveReminder, setShowSaveReminder] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hamburgerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target as Node)) setHamburgerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hamburgerOpen]);

  // Trigger easter egg whenever the Cut tool is exited (any exit path)
  // Also show save reminder whenever any edit tool is exited back to "none"
  const prevActiveTool = useRef<EditTool>("none");
  useEffect(() => {
    const prev = prevActiveTool.current;
    prevActiveTool.current = activeTool;
    if (prev === "cut" && activeTool !== "cut") {
      setEasterEggVisible(true);
    }
    if (prev !== "none" && activeTool === "none") {
      setShowSaveReminder(true);
      const timer = setTimeout(() => setShowSaveReminder(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [activeTool]);

  function handleSettingsSave(updates: {
    name?: string;
    wordsPerMinute?: number;
    quickChangeThresholdMinutes?: number;
    rehearsalMinBlockMinutes?: number;
    rehearsalMaxBlockMinutes?: number;
    minActorStageTimeMinutes?: number;
  }) {
    if (updates.name !== undefined) {
      dispatch({ type: "RENAME_PROJECT", name: updates.name });
    }
    const { wordsPerMinute, quickChangeThresholdMinutes, rehearsalMinBlockMinutes, rehearsalMaxBlockMinutes, minActorStageTimeMinutes } = updates;
    if (wordsPerMinute !== undefined || quickChangeThresholdMinutes !== undefined ||
        rehearsalMinBlockMinutes !== undefined || rehearsalMaxBlockMinutes !== undefined ||
        minActorStageTimeMinutes !== undefined) {
      dispatch({
        type: "UPDATE_SETTINGS",
        settings: {
          ...(wordsPerMinute !== undefined ? { wordsPerMinute } : {}),
          ...(quickChangeThresholdMinutes !== undefined ? { quickChangeThresholdMinutes } : {}),
          ...(rehearsalMinBlockMinutes !== undefined ? { rehearsalMinBlockMinutes } : {}),
          ...(rehearsalMaxBlockMinutes !== undefined ? { rehearsalMaxBlockMinutes } : {}),
          ...(minActorStageTimeMinutes !== undefined ? { minActorStageTimeMinutes } : {}),
        },
      });
    }
  }

  function handleExportJson() {
    exportProject(project);
  }

  async function handleExportHtml() {
    if (!activeCut) return;
    setExportingHtml(true);
    try {
      const r = await fetch(`/api/play/${project.playId}`);
      const play: Play = await r.json();
      exportScriptHtml(play, activeCut, project.name, project.actors, project.assignments);
    } finally {
      setExportingHtml(false);
    }
  }

  async function handleExportDocx(viewMode: "clean" | "standard") {
    if (!activeCut) return;
    setExportingDocx(true);
    try {
      const r = await fetch(`/api/play/${project.playId}`);
      const play: Play = await r.json();
      const res = await fetch("/api/export/script-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ play, cut: activeCut, viewMode }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const cdHeader = res.headers.get("Content-Disposition") ?? "";
      const match = cdHeader.match(/filename\*=UTF-8''(.+)/);
      const filename = match ? decodeURIComponent(match[1]) : `script_${viewMode}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingDocx(false);
    }
  }

  const navLinks = [
    { href: `/projects/${projectId}`,          label: "Script",      Icon: ScriptIcon },
    { href: `/projects/${projectId}/casting`,  label: "Casting",     Icon: CastingIcon },
    { href: `/projects/${projectId}/export`,   label: "Cue Scripts", Icon: CueScriptIcon },
  ];

  return (
    <header className="no-print border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">

        {/* Logo — scissors by default, Shakespeare head on hover with wiggle */}
        <Link
          href="/"
          className="sss-logo-link relative flex items-center shrink-0 w-6 h-6"
          title="ShakesScriptScissors — home"
        >
          <style>{`
            @keyframes shakes-wiggle {
              0%,100% { transform: rotate(0deg) scale(1); }
              20%      { transform: rotate(-12deg) scale(1.1); }
              40%      { transform: rotate(10deg) scale(1.05); }
              60%      { transform: rotate(-8deg) scale(1.08); }
              80%      { transform: rotate(6deg) scale(1.03); }
            }
            .sss-scissors { opacity: 1; transform: scale(1); transition: opacity 0.15s, transform 0.15s; }
            .sss-shakes   { opacity: 0; transform: scale(0.5); transition: opacity 0.15s, transform 0.15s; }
            .sss-label    { opacity: 0; transform: translateX(-4px); pointer-events: none; transition: opacity 0.2s, transform 0.2s; }
            .sss-logo-link:hover .sss-scissors { opacity: 0; transform: scale(0.5); }
            .sss-logo-link:hover .sss-shakes   { opacity: 1; transform: scale(1); animation: shakes-wiggle 0.5s ease-in-out; }
            .sss-logo-link:hover .sss-label    { opacity: 1; transform: translateX(0); pointer-events: auto; }
          `}</style>

          {/* Scissors — fades/scales out on hover */}
          <span className="sss-scissors absolute inset-0 flex items-center justify-center text-base select-none text-stone-400">✂</span>

          {/* Shakespeare head — fades/scales in on hover */}
          <span className="sss-shakes w-6 h-6 rounded-full bg-amber-50 dark:bg-stone-200 overflow-hidden flex items-center justify-center">
            <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
              <ellipse cx="24" cy="50" rx="16" ry="6" fill="#f5f0e8" stroke="#d4c9a8" strokeWidth="0.8" />
              <path d="M8 50 Q12 44 16 47 Q20 44 24 47 Q28 44 32 47 Q36 44 40 47 Q40 50 40 50" fill="#f5f0e8" stroke="#d4c9a8" strokeWidth="0.8" />
              <rect x="20" y="42" width="8" height="8" rx="1" fill="#e8c99a" />
              <ellipse cx="24" cy="26" rx="13" ry="15" fill="#e8c99a" />
              <path d="M11 22 Q8 18 9 14 Q10 20 12 22Z" fill="#8b6914" />
              <path d="M37 22 Q40 18 39 14 Q38 20 36 22Z" fill="#8b6914" />
              <path d="M11 26 Q7 24 8 20 Q10 24 12 26Z" fill="#8b6914" />
              <path d="M37 26 Q41 24 40 20 Q38 24 36 26Z" fill="#8b6914" />
              <ellipse cx="11" cy="26" rx="2.5" ry="3" fill="#ddb880" />
              <ellipse cx="37" cy="26" rx="2.5" ry="3" fill="#ddb880" />
              <ellipse cx="20" cy="25" rx="2" ry="1.5" fill="#4a3520" />
              <ellipse cx="28" cy="25" rx="2" ry="1.5" fill="#4a3520" />
              <circle cx="20.6" cy="24.5" r="0.5" fill="#fff" />
              <circle cx="28.6" cy="24.5" r="0.5" fill="#fff" />
              <path d="M23 27 Q24 31 25 27" stroke="#c0956a" strokeWidth="0.8" fill="none" />
              <path d="M21 33 Q24 35.5 27 33" stroke="#a0704a" strokeWidth="1" fill="none" strokeLinecap="round" />
              <path d="M20 31.5 Q22 33 24 31.5 Q26 33 28 31.5" stroke="#7a5010" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <path d="M21 35 Q24 39 27 35" stroke="#7a5010" strokeWidth="1" fill="none" strokeLinecap="round" />
              <path d="M22 35.5 Q24 40 26 35.5" fill="#8b6914" opacity="0.5" />
            </svg>
          </span>

          {/* Hover-reveal label — slides in over the nav, solid bg, no layout shift */}
          <span className="sss-label absolute left-7 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 pl-1 pr-3 z-10">
            ShakesScriptScissors
          </span>
        </Link>

        {/* Project title — links to dashboard; highlighted when on dashboard */}
        <Link
          href={`/projects/${projectId}/dashboard`}
          className={`group flex flex-col justify-center min-w-0 max-w-[100px] sm:max-w-xs px-1.5 py-1 rounded transition-colors ${
            isDashboard
              ? "bg-amber-100 dark:bg-amber-900/40"
              : "hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
          title={project.name ? `${project.playTitle} — go to dashboard` : "Go to dashboard"}
        >
          <div className="flex items-center gap-1">
            <span className={`font-semibold text-sm truncate leading-tight transition-colors ${
              isDashboard
                ? "text-amber-800 dark:text-amber-300"
                : "text-stone-700 dark:text-stone-200 group-hover:text-amber-600 dark:group-hover:text-amber-400"
            }`}>
              {project.name || project.playTitle}
            </span>
            <span className={`transition-opacity shrink-0 ${
              isDashboard
                ? "opacity-70 text-amber-700 dark:text-amber-400"
                : "opacity-40 group-hover:opacity-80 text-stone-400 group-hover:text-amber-500 dark:text-stone-500 dark:group-hover:text-amber-400"
            }`}>
              <DashboardIcon />
            </span>
          </div>
          {/* Second line: play title (when project name differs) + cut name (always shown) */}
          {(project.name && project.playTitle && project.name !== project.playTitle) || activeCut?.name ? (
            <span className="text-stone-400 dark:text-stone-500 text-xs truncate leading-tight">
              {project.name && project.playTitle && project.name !== project.playTitle
                ? <em>{project.playTitle}</em> : null}
              {project.name && project.playTitle && project.name !== project.playTitle && activeCut?.name ? " " : null}
              {activeCut?.name ? <span className="not-italic">({activeCut.name})</span> : null}
            </span>
          ) : null}
        </Link>

        {/* Nav links with icons */}
        <nav className="flex gap-1 shrink-0">
          {navLinks.map(({ href, label, Icon }) => {
            const isScript = href === `/projects/${projectId}`;
            const isActive = isScript ? isScriptPage : pathname === href;
            if (isScript) {
              return <NavScriptMenu key={href} projectId={projectId} isActive={isScriptPage} Icon={Icon} />;
            }
            return (
              <Link
                key={href}
                href={href}
                className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                <Icon />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Script-page controls — desktop only */}
        {isScriptPage && (
          <div className="hidden lg:flex items-center gap-1">
            <NavEditModeButton />
            <NavSearchButton />
            <NavJumpSelect />
          </div>
        )}

        {/* Hamburger — tablet/mobile, script page only */}
        {isScriptPage && (
          <div ref={hamburgerRef} className="relative lg:hidden">
            <button
              onClick={() => setHamburgerOpen((o) => !o)}
              className="p-1.5 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title="Script controls"
              aria-label="Script controls menu"
            >
              <HamburgerIcon />
            </button>
            {hamburgerOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg p-3 z-50 flex flex-col gap-3">
                <div className="text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wider font-semibold">Script controls</div>
                <NavEditModeButton onActivated={() => setHamburgerOpen(false)} />
                <NavSearchButton onActivated={() => setHamburgerOpen(false)} />
                <NavJumpSelect />
              </div>
            )}
          </div>
        )}

        {/* Settings gear */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="shrink-0 text-stone-400 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Settings"
          aria-label="Open settings"
        >
          <GearIcon />
        </button>

        {settingsOpen && (
          <SettingsModal
            project={project}
            onSave={handleSettingsSave}
            onClose={() => setSettingsOpen(false)}
            onExportJson={handleExportJson}
            onExportHtml={handleExportHtml}
            exportingHtml={exportingHtml}
            onExportDocx={handleExportDocx}
            exportingDocx={exportingDocx}
          />
        )}
      </div>

      {/* Edit mode toolbar — shown whenever a tool is active */}
      {activeTool !== "none" && (
        <EditToolbar activeTool={activeTool} setActiveTool={setActiveTool} />
      )}

      {/* Easter egg — fires when cut mode exits */}
      <ShakespeareAnimation
        variant="cut"
        visible={easterEggVisible}
        onDismiss={() => setEasterEggVisible(false)}
      />

      {/* Save reminder — shown briefly whenever any edit tool is exited */}
      {showSaveReminder && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 shadow-lg dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-200 text-sm">
          <span>Changes are saved in <strong>this app only</strong>. Download a backup: <strong>⚙ → Save Project</strong>.</span>
          <button
            onClick={() => setShowSaveReminder(false)}
            className="ml-1 text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 transition-colors text-base leading-none"
            aria-label="Dismiss"
          >✕</button>
        </div>
      )}
    </header>
  );
}

/** Script nav item: link + view-mode dropdown */
function NavScriptMenu({ projectId, isActive, Icon }: { projectId: string; isActive: boolean; Icon: React.FC }) {
  const { viewMode, setViewMode } = useViewMode();
  const router = useRouter();
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
        className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
          isActive ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800"
        }`}
      >
        <Icon />
        <span className="hidden md:inline">Script</span>
        <span className="text-xs opacity-70">{currentIcon}</span>
        <span className="text-xs opacity-40">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 pt-1.5 pb-1 text-xs text-stone-400 dark:text-stone-400 uppercase tracking-wider font-semibold">
            View mode
          </div>
          {modeOptions.map(({ value, icon, label, desc }) => (
            <button
              key={value}
              onClick={() => { setViewMode(value); router.push(`/projects/${projectId}`); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-start gap-2 ${
                viewMode === value ? "text-amber-800 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30" : "text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
            >
              <span className="mt-0.5 w-4 shrink-0 text-center text-xs">{icon}</span>
              <span className="flex flex-col min-w-0">
                <span className={viewMode === value ? "font-semibold" : "font-medium"}>{label}</span>
                <span className="text-xs text-stone-400 dark:text-stone-400 font-normal">{desc}</span>
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

function NavEditModeButton({ onActivated }: { onActivated?: () => void }) {
  const { activeTool, setActiveTool } = useEditMode();
  const { viewMode, setViewMode } = useViewMode();
  if (activeTool !== "none") return null;
  return (
    <button
      onClick={() => {
        // Clean view is read-only; switch to standard before entering edit mode
        if (viewMode === "clean") setViewMode("standard");
        setActiveTool("cut");
        onActivated?.();
      }}
      className="text-xs px-3 py-1.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 hover:text-amber-700 dark:hover:text-amber-400 transition-colors shrink-0"
      title={viewMode === "clean" ? "Enter edit mode (will switch to Standard view)" : "Enter edit mode"}
    >
      ✎ Edit
    </button>
  );
}

const CUT_GUIDE = (
  <div className="mt-3 pt-3 border-t border-stone-700 space-y-2">
    <p className="text-stone-300 font-semibold text-xs">How to cut a play</p>
    <p><strong className="text-stone-200">Why cut?</strong> Cuts serve three goals: <em>Time</em> (fit a running-time constraint), <em>Audience</em> (sharpen clarity and pacing), or <em>Story</em> (focus a directorial concept). Every cut should serve at least one of these.</p>
    <p><strong className="text-stone-200">Understand before you cut.</strong> Never remove a line you don&apos;t understand. Ask why the playwright put it there. What function does it serve in the story? If you don&apos;t know why it&apos;s there, you can&apos;t plan around its absence.</p>
    <p><strong className="text-stone-200">The Jenga principle.</strong> Every element in the play is there for a reason. Cutting one piece can destabilize the structure scenes later — callbacks, setups, rhythms, and character arcs can all depend on what seems like a throwaway line.</p>
    <p><strong className="text-stone-200">Know what you lose.</strong> A cut that saves five minutes may remove texture, thematic resonance, or a setup for a later payoff. Cuts must be justified — and you should be clear about what the production gains and loses.</p>
    <p><strong className="text-stone-200">No single right answer.</strong> Different directors cut the same play very differently. Your cut reflects your production&apos;s interpretation. The Dashboard&apos;s Line Count and Time tabs help you track the impact as you go.</p>
    <p><strong className="text-stone-200">Copyright.</strong> Shakespeare is public domain. For plays from the last ~80 years, cutting may require permission from the rights holder.</p>
    <p className="text-stone-500 italic">— adapted from Toby Malone &amp; Aili Huber, <em>Cutting Plays for Performance</em> (Routledge, 2022)</p>
  </div>
);

const TOOL_CONFIG: Record<Exclude<EditTool, "none">, { icon: string; label: string; desc: string; guide?: React.ReactNode }> = {
  cut:      { icon: "✂\uFE0E",  label: "Cut",          desc: "Drag to select text — release to cut. Spans speeches freely.", guide: CUT_GUIDE },
  insert:   { icon: "+",        label: "Insert",        desc: "Click between units to insert custom text, or click anywhere within a line to insert a word." },
  restore:  { icon: "↺",        label: "Restore",       desc: "Click ↩ on any speech to restore it. Use ↩ restore all on any scene header to restore every cut in that scene at once." },
  "edit-sds": { icon: "⊕",     label: "Edit SDs",      desc: "Edit character lists on entrance/exit SDs, sync exits/entrances, and insert new stage directions between units." },
  reassign: { icon: "⇄",        label: "Reassign",      desc: "Click a character name to reassign that speech to another character." },
  split:    { icon: "⌥",        label: "Split/Indent",  desc: "Click anywhere within a line to split at a word, or click ✂ between lines for a clean split. Use ⇤/⊕ buttons on first/last lines of a speech to toggle shared-verse indentation." },
  "song-dance": { icon: "♪⊛",  label: "Song/Dance",    desc: "Toggle ♪ song / ⊛ dance flags on existing stage directions. Click any line to toggle it as a sung line." },
};

function EditToolbar({ activeTool, setActiveTool }: { activeTool: EditTool; setActiveTool: (t: EditTool) => void }) {
  const { dispatch, canUndo, canRedo } = useProject();
  const [showHelp, setShowHelp] = useState(false);
  const tools = Object.entries(TOOL_CONFIG) as [Exclude<EditTool, "none">, typeof TOOL_CONFIG[Exclude<EditTool, "none">]][];
  const activeConfig = activeTool !== "none" ? TOOL_CONFIG[activeTool] : null;

  function handleSetTool(tool: Exclude<EditTool, "none">) {
    setActiveTool(tool);
  }

  return (
    // overflow-x-auto allows horizontal scroll on narrow viewports so Done button stays accessible
    <div className="absolute inset-0 bg-red-700 dark:bg-red-900 border-t border-red-600 dark:border-red-800 overflow-x-auto z-10">
      <div className="min-w-max flex items-center h-full px-3 gap-2">
        {/* Tool buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {tools.map(([tool, cfg]) => (
            <button
              key={tool}
              onClick={() => handleSetTool(tool)}
              className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                activeTool === tool
                  ? "bg-white text-red-700 font-semibold"
                  : "text-red-200 hover:text-white hover:bg-red-600 dark:text-red-300 dark:hover:bg-red-800"
              }`}
              title={cfg.desc}
            >
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>

        {/* ? help toggle — shows a fixed overlay bubble over the full screen */}
        {activeConfig && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className={`text-xs w-5 h-5 rounded-full flex items-center justify-center transition-colors font-mono ${
                showHelp
                  ? "bg-white text-red-700"
                  : "text-red-300 hover:text-white border border-red-500 hover:border-red-300"
              }`}
              title="Toggle help text"
            >?</button>
            {showHelp && (
              <div
                className="fixed z-[200] bg-stone-900 dark:bg-stone-800 text-stone-100 text-xs rounded-lg px-4 py-3 shadow-2xl whitespace-normal leading-relaxed border border-stone-700 overflow-y-auto"
                style={{ top: 50, left: "50%", transform: "translateX(-50%)", width: "min(540px, calc(100vw - 2rem))", maxHeight: "calc(100vh - 80px)" }}
              >
                {activeConfig.desc}
                {activeConfig.guide}
              </div>
            )}
          </div>
        )}

        {/* Undo / Redo */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={!canUndo}
            className={`text-xs px-2 py-1 rounded transition-colors ${canUndo ? "text-red-200 hover:text-white hover:bg-red-600 dark:hover:bg-red-800" : "text-red-200/30 dark:text-red-300/25 cursor-not-allowed pointer-events-none"}`}
            title="Undo last edit (⌘Z) — up to 20 steps; history clears when switching cuts or reloading"
          >
            ⟲ Undo
          </button>
          <button
            onClick={() => dispatch({ type: "REDO" })}
            disabled={!canRedo}
            className={`text-xs px-2 py-1 rounded transition-colors ${canRedo ? "text-red-200 hover:text-white hover:bg-red-600 dark:hover:bg-red-800" : "text-red-200/30 dark:text-red-300/25 cursor-not-allowed pointer-events-none"}`}
            title="Redo (⌘⇧Z) — history clears when switching cuts or reloading"
          >
            ⟳ Redo
          </button>

          {/* Done button */}
          <button
            onClick={() => setActiveTool("none")}
            className="text-xs text-red-200 dark:text-red-300 hover:text-white border border-red-500 dark:border-red-700 hover:border-red-300 dark:hover:border-red-500 px-3 py-1 rounded transition-colors"
            title="Exit edit mode (Esc)"
          >
            ✕ Done
          </button>
        </div>
      </div>
    </div>
  );
}

function NavSearchButton({ onActivated }: { onActivated?: () => void }) {
  const { searchOpen, setSearchOpen } = useSearch();
  return (
    <button
      onClick={() => { setSearchOpen(!searchOpen); onActivated?.(); }}
      title="Find in script (Cmd+F / Ctrl+F)"
      className={`p-1.5 rounded border transition-colors ${
        searchOpen
          ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-400"
          : "border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 hover:border-stone-300 dark:hover:border-stone-600"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </button>
  );
}

/** Condensed scene jump select — labels like "1:1", "2:3", "pr:1", "3:ch" */
function NavJumpSelect() {
  const { scenes, activeSceneId, setActiveSceneId, jumpToScene, focusedSceneId, setFocusedSceneId, hiddenSceneIds } = useSceneJump();
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
        <span
          className="text-xs font-medium tabular-nums px-2 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 w-16 text-center select-none"
          title="Scene jumper locked in focus mode"
        >
          {focusedLabel}
        </span>
      ) : (
        <select
          value={activeSceneId}
          onChange={(e) => { const val = e.target.value; if (val) { setActiveSceneId(val); jumpToScene(val); } }}
          className="text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400 w-16"
        >
          <option value="">—</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id} disabled={hiddenSceneIds.has(s.id)}>
              {hiddenSceneIds.has(s.id) ? `— ${s.label}` : s.label}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handleFocusToggle}
        title={isFocused ? "Exit focus" : "Focus current scene"}
        className={`text-sm px-1.5 py-1 rounded border transition-colors ${
          isFocused
            ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-400"
            : "border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-600 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-300"
        }`}
      >
        {isFocused ? "◉" : "○"}
      </button>
    </div>
  );
}
