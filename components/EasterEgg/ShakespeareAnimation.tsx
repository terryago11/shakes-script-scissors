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
      className="fixed bottom-4 left-4 z-50 flex items-end gap-3 animate-shakespeare-in"
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

      {/* Shakespeare quill SVG */}
      <div className="shrink-0 w-14 h-14 flex items-end justify-center">
        <svg
          viewBox="0 0 48 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-12 h-12 drop-shadow"
        >
          {/* Feather quill */}
          <path
            d="M40 2 C44 8 44 16 38 22 L18 48 L14 52 L12 58 L10 52 L6 50 L12 48 L32 24 C26 18 26 10 30 4 C33 8 35 14 34 20 C38 14 40 8 40 2Z"
            fill="#d4b896"
            stroke="#a08060"
            strokeWidth="1"
          />
          <path
            d="M34 20 L12 48"
            stroke="#a08060"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
          {/* Ink nib */}
          <path
            d="M12 48 L10 52 L6 50 L12 48Z"
            fill="#1a1a2e"
          />
          {/* Ink scratch marks */}
          {variant === "cut" ? (
            <g stroke="#c0392b" strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
              <line x1="2" y1="54" x2="8" y2="58" />
              <line x1="4" y1="52" x2="10" y2="56" />
            </g>
          ) : (
            <g stroke="#27ae60" strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
              <line x1="2" y1="58" x2="5" y2="55" />
              <line x1="5" y1="55" x2="10" y2="60" />
            </g>
          )}
        </svg>
      </div>

      {/* Speech bubble */}
      <div className="mb-2 bg-stone-900 dark:bg-stone-700 text-white rounded-xl px-4 py-2.5 shadow-lg max-w-48 relative">
        <div
          className="absolute -left-2 bottom-3 w-0 h-0"
          style={{
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderRight: "8px solid rgb(28 25 23)", // stone-900
          }}
        />
        <p className="font-serif text-sm font-semibold leading-snug">
          {variant === "cut" ? "Scratch it out!" : "Scratch it back in!"}
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-300 mt-0.5 font-sans">
          — Wm. Shakespeare, probably
        </p>
      </div>
    </div>
  );
}
