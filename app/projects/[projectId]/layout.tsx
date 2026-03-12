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
import { CutModeProvider, useCutMode } from "@/lib/ui/CutModeContext";
import { MetricProvider } from "@/lib/ui/MetricContext";
import { ViewModeProvider, useViewMode, type ViewMode } from "@/lib/ui/ViewModeContext";

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
  const { cutModeActive } = useCutMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
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

  // Trigger easter egg whenever cut mode is exited (button or Escape)
  const prevCutModeActive = useRef(false);
  useEffect(() => {
    if (prevCutModeActive.current && !cutModeActive) {
      setEasterEggVisible(true);
    }
    prevCutModeActive.current = cutModeActive;
  }, [cutModeActive]);

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

        {/* Project title — links to dashboard */}
        <Link
          href={`/projects/${projectId}/dashboard`}
          className="group flex flex-col justify-center min-w-0 max-w-[100px] sm:max-w-xs"
          title={project.name ? `${project.playTitle} — go to dashboard` : "Go to dashboard"}
        >
          <div className="flex items-center gap-1">
            <span className="text-stone-700 dark:text-stone-200 font-semibold text-sm truncate leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {project.name || project.playTitle}
            </span>
            <span className="opacity-40 group-hover:opacity-80 transition-opacity shrink-0 text-stone-400 group-hover:text-amber-500 dark:text-stone-500 dark:group-hover:text-amber-400">
              <DashboardIcon />
            </span>
          </div>
          {project.name && project.playTitle && project.name !== project.playTitle && (
            <span className="text-stone-400 dark:text-stone-400 text-xs italic truncate leading-tight">
              {project.playTitle}
            </span>
          )}
        </Link>

        {/* Nav links with icons */}
        <nav className="flex gap-1 shrink-0">
          {navLinks.map(({ href, label, Icon }) => {
            const isScript = href === `/projects/${projectId}`;
            const isActive = isScript ? isScriptPage : pathname === href;
            if (isScript && isScriptPage) {
              return <NavScriptMenu key={href} projectId={projectId} isActive Icon={Icon} />;
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
            <NavCutModeButton />
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
                <NavCutModeButton />
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

      {/* Easter egg — fires when cut mode exits */}
      <ShakespeareAnimation
        variant="cut"
        visible={easterEggVisible}
        onDismiss={() => setEasterEggVisible(false)}
      />
    </header>
  );
}

/** Script nav item: link + view-mode dropdown */
function NavScriptMenu({ projectId, isActive, Icon }: { projectId: string; isActive: boolean; Icon: React.FC }) {
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
              onClick={() => { setViewMode(value); setOpen(false); }}
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

function NavCutModeButton() {
  const { cutModeActive, setCutModeActive } = useCutMode();
  if (cutModeActive) return null;
  return (
    <button
      onClick={() => setCutModeActive(true)}
      className="text-xs px-3 py-1.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
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
