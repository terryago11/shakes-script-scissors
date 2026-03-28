"use client";

import { useTheme } from "@/lib/ui/ThemeContext";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12 2 C 10 2, 4 6, 2 12 L 4 10 C 5 7, 8 5, 12 2Z" fill="currentColor" opacity="0.8"/>
      <path d="M2 12 L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="10" x2="3" y2="13" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

const options = [
  { value: "light" as const, Icon: SunIcon, title: "Light mode" },
  { value: "dark" as const, Icon: MoonIcon, title: "Dark mode" },
  { value: "auto" as const, Icon: MonitorIcon, title: "Auto (system)" },
  { value: "1602" as const, Icon: QuillIcon, title: "1602 (Renaissance)" },
] as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded border border-stone-200 dark:border-stone-700 overflow-hidden shrink-0">
      {options.map(({ value, Icon, title }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={title}
          className={`px-1.5 py-1.5 transition-colors flex items-center justify-center ${
            theme === value
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "text-stone-400 hover:text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800"
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
