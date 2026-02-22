"use client";

import { useEffect, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject, loadProjectFromStorage } from "@/lib/project/ProjectStore";
import { exportProject } from "@/lib/project/projectIO";
import CutSelector from "@/components/CutSelector/CutSelector";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { project, loadProject } = useProject();
  const pathname = usePathname();

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

  const navLinks = [
    { href: `/projects/${projectId}`, label: "Script" },
    { href: `/projects/${projectId}/casting`, label: "Casting" },
    { href: `/projects/${projectId}/export`, label: "Cue Scripts" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="no-print border-b border-stone-200 bg-white sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm mr-2">
            ✂ ShakesScriptScissors
          </Link>
          <span className="text-stone-700 font-semibold text-sm truncate max-w-xs">
            {project.playTitle}
          </span>

          <nav className="flex gap-1 ml-4">
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

          <div className="ml-auto flex items-center gap-3">
            <CutSelector />
            <button
              onClick={() => exportProject(project)}
              className="text-xs px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
            >
              Export JSON
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
