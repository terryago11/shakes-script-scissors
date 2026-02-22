"use client";

import type { StageDirection } from "@/types/play";

interface Props {
  stage: StageDirection;
  status: "kept" | "cut";
  onToggle: () => void;
}

export default function StageDirectionBlock({ stage, status, onToggle }: Props) {
  const isCut = status === "cut";

  return (
    <div
      className={`group flex gap-3 py-1.5 px-2 rounded cursor-pointer transition-colors ${
        isCut ? "opacity-40 hover:opacity-60" : "hover:bg-stone-50"
      }`}
      onClick={onToggle}
      title={isCut ? "Click to restore" : "Click to cut"}
    >
      <div className="w-1 shrink-0" />
      <div
        className={`text-sm italic text-stone-500 ${
          isCut ? "line-through text-stone-400" : ""
        }`}
      >
        {stage.text}
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 text-stone-300 text-xs self-center">
        {isCut ? "↩" : "✕"}
      </div>
    </div>
  );
}
