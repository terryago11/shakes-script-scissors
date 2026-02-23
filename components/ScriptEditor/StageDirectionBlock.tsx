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
    <div
      className={`group flex gap-3 py-1.5 px-2 rounded transition-colors ${
        readonly
          ? isCut ? "opacity-40" : ""
          : isCut
          ? "opacity-40 hover:opacity-60 cursor-pointer"
          : "hover:bg-stone-50 cursor-pointer"
      }`}
      onClick={readonly ? undefined : onToggle ?? undefined}
      title={readonly ? undefined : isCut ? "Click to restore" : "Click to cut"}
    >
      <div className="w-1 shrink-0" />
      <div
        className={`text-sm italic text-stone-500 ${
          isCut ? "line-through text-stone-400" : ""
        }`}
      >
        {stage.text}
      </div>
      {!readonly && (
        <div className="shrink-0 opacity-0 group-hover:opacity-100 text-stone-300 text-xs self-center">
          {isCut ? "↩" : "✕"}
        </div>
      )}
    </div>
  );
}
