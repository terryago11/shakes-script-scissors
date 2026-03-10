"use client";

import { useEffect } from "react";

interface Props {
  variant: "cut" | "restore";
  visible: boolean;
  onDismiss: () => void;
}

export default function ShakespeareAnimation({ variant, visible, onDismiss }: Props) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-end gap-3 animate-shakespeare-in"
      onClick={onDismiss}
      role="status"
      aria-live="polite"
    >
      <style>{`
        @keyframes shakespeare-in {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-shakespeare-in {
          animation: shakespeare-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      {/* Speech bubble — points right toward the icon */}
      <div className="mb-2 bg-stone-900 dark:bg-stone-800 text-white rounded-xl px-4 py-2.5 shadow-lg max-w-48 relative">
        <div
          className="absolute -right-2 bottom-3 w-0 h-0"
          style={{
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderLeft: "8px solid rgb(28 25 23)",
          }}
        />
        <p className="font-serif text-sm font-semibold leading-snug">
          {variant === "cut" ? "Scratch it out!" : "Scratch it back in!"}
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-400 mt-0.5 font-sans">
          — Wm. Shakespeare, probably
        </p>
      </div>

      {/* Shakespeare head in a circle */}
      <div className="shrink-0 w-12 h-12 rounded-full bg-amber-50 dark:bg-stone-200 shadow-lg flex items-center justify-center overflow-hidden">
        <svg
          viewBox="0 0 48 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-12"
        >
          {/* Ruff collar */}
          <ellipse cx="24" cy="50" rx="16" ry="6" fill="#f5f0e8" stroke="#d4c9a8" strokeWidth="0.8" />
          <path d="M8 50 Q12 44 16 47 Q20 44 24 47 Q28 44 32 47 Q36 44 40 47 Q40 50 40 50" fill="#f5f0e8" stroke="#d4c9a8" strokeWidth="0.8" />
          {/* Neck */}
          <rect x="20" y="42" width="8" height="8" rx="1" fill="#e8c99a" />
          {/* Head */}
          <ellipse cx="24" cy="26" rx="13" ry="15" fill="#e8c99a" />
          {/* Hair on sides (wispy) */}
          <path d="M11 22 Q8 18 9 14 Q10 20 12 22Z" fill="#8b6914" />
          <path d="M37 22 Q40 18 39 14 Q38 20 36 22Z" fill="#8b6914" />
          <path d="M11 26 Q7 24 8 20 Q10 24 12 26Z" fill="#8b6914" />
          <path d="M37 26 Q41 24 40 20 Q38 24 36 26Z" fill="#8b6914" />
          {/* Bald top — skin colored dome, no fill change */}
          {/* Ears */}
          <ellipse cx="11" cy="26" rx="2.5" ry="3" fill="#ddb880" />
          <ellipse cx="37" cy="26" rx="2.5" ry="3" fill="#ddb880" />
          {/* Eyes */}
          <ellipse cx="20" cy="25" rx="2" ry="1.5" fill="#4a3520" />
          <ellipse cx="28" cy="25" rx="2" ry="1.5" fill="#4a3520" />
          <circle cx="20.6" cy="24.5" r="0.5" fill="#fff" />
          <circle cx="28.6" cy="24.5" r="0.5" fill="#fff" />
          {/* Nose */}
          <path d="M23 27 Q24 31 25 27" stroke="#c0956a" strokeWidth="0.8" fill="none" />
          {/* Mouth — slight smile */}
          <path d="M21 33 Q24 35.5 27 33" stroke="#a0704a" strokeWidth="1" fill="none" strokeLinecap="round" />
          {/* Moustache */}
          <path d="M20 31.5 Q22 33 24 31.5 Q26 33 28 31.5" stroke="#7a5010" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          {/* Chin beard */}
          <path d="M21 35 Q24 39 27 35" stroke="#7a5010" strokeWidth="1" fill="none" strokeLinecap="round" />
          <path d="M22 35.5 Q24 40 26 35.5" fill="#8b6914" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}
