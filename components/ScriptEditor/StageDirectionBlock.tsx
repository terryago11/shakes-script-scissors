"use client";

import type { StageDirection } from "@/types/play";

interface Props {
  stage: StageDirection;
  status: "kept" | "cut";
  onToggle: (() => void) | null;
}

export default function StageDirectionBlock({ stage, status, onToggle }: Props) {
  const isCut = status === "cut";
  const readonly = onToggle === null;

  return (
    <div className={`group flex items-start gap-3 py-1.5 px-2 rounded ${isCut ? "opacity-50" : ""}`}>
      <div className="w-1 shrink-0" />
      <div className={`text-sm italic text-stone-500 flex-1 min-w-0 ${isCut ? "line-through text-stone-400" : ""}`}>
        {stage.text}
      </div>
      {!readonly && isCut && (
        <button
          onClick={onToggle ?? undefined}
          className="opacity-0 group-hover:opacity-100 self-center text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-all shrink-0"
          title="Restore stage direction"
        >
          ↩ restore
        </button>
      )}
    </div>
  );
}
