"use client";

import type { Speech } from "@/types/play";

interface Props {
  speech: Speech;
  status: "kept" | "cut";
  actorColor?: string;
  onToggle: () => void;
}

export default function SpeechBlock({ speech, status, actorColor, onToggle }: Props) {
  const isCut = status === "cut";

  return (
    <div
      className={`group flex gap-3 py-2 px-2 rounded cursor-pointer transition-colors ${
        isCut
          ? "opacity-40 hover:opacity-70 bg-stone-50"
          : "hover:bg-stone-50"
      }`}
      onClick={onToggle}
      title={isCut ? "Click to restore" : "Click to cut"}
    >
      {/* Actor color indicator */}
      <div
        className="w-1 rounded-full shrink-0 mt-1"
        style={{
          backgroundColor: actorColor || "#d1d5db",
          minHeight: "1.25rem",
        }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name */}
        <div
          className={`text-xs font-bold uppercase tracking-wider mb-1 ${
            isCut ? "text-stone-400 line-through" : "text-stone-600"
          }`}
          style={{ color: isCut ? undefined : actorColor || undefined }}
        >
          {speech.characterName}
          <span className="ml-2 font-normal text-stone-400 normal-case tracking-normal">
            ({speech.lineCount}L)
          </span>
        </div>

        {/* Lines */}
        <div
          className={`font-serif text-sm leading-relaxed ${
            isCut ? "line-through text-stone-400" : "text-stone-800"
          }`}
        >
          {speech.lines.map((line) => (
            <div key={line.id}>{line.text}</div>
          ))}
        </div>
      </div>

      {/* Cut indicator */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 text-stone-400 text-xs self-start mt-1">
        {isCut ? "↩" : "✕"}
      </div>
    </div>
  );
}
