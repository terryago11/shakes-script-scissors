"use client";

import { useTheme } from "@/lib/ui/ThemeContext";

const options = [
  { value: "light" as const, icon: "☀", title: "Light mode" },
  { value: "auto" as const, icon: "⬚", title: "Auto (system)" },
  { value: "dark" as const, icon: "☾", title: "Dark mode" },
] as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded border border-stone-200 dark:border-stone-700 overflow-hidden shrink-0">
      {options.map(({ value, icon, title }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={title}
          className={`px-1.5 py-1 text-sm transition-colors ${
            theme === value
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "text-stone-400 hover:text-stone-600 hover:bg-stone-50 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
