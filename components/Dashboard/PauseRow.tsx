"use client";

import { useState } from "react";

interface Props {
  afterSceneId: string;
  pause?: { name: string; minutes: number };
  onSet: (afterSceneId: string, name: string, minutes: number) => void;
  onRemove: (afterSceneId: string) => void;
}

export default function PauseRow({ afterSceneId, pause, onSet, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editMinutes, setEditMinutes] = useState(15);

  function startAdd() {
    setEditName("Intermission");
    setEditMinutes(15);
    setEditing(true);
  }

  function startEdit() {
    if (!pause) return;
    setEditName(pause.name);
    setEditMinutes(pause.minutes);
    setEditing(true);
  }

  function handleSave() {
    const name = editName.trim() || "Intermission";
    const minutes = Math.max(0, editMinutes);
    onSet(afterSceneId, name, minutes);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="my-2 flex items-center gap-2 px-3 py-2 rounded border border-amber-300 bg-amber-50">
        <span className="text-amber-500 text-xs shrink-0">⏸</span>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className="flex-1 text-sm border border-amber-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 text-stone-700"
          placeholder="Pause name"
          autoFocus
        />
        <input
          type="number"
          value={editMinutes}
          onChange={(e) => setEditMinutes(Number(e.target.value))}
          min={0}
          step={1}
          className="w-16 text-sm border border-amber-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 text-stone-700 tabular-nums"
        />
        <span className="text-xs text-amber-600 shrink-0">min</span>
        <button
          onClick={handleSave}
          className="text-xs px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors shrink-0"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          className="text-xs px-2 py-0.5 border border-stone-200 rounded text-stone-500 hover:bg-stone-50 transition-colors shrink-0"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (pause) {
    return (
      <div className="my-2 flex items-center gap-2 px-3 py-1.5 rounded border border-amber-200 bg-amber-50">
        <span className="text-amber-500 text-xs shrink-0">⏸</span>
        <span className="text-sm font-medium text-amber-800 flex-1">{pause.name}</span>
        <span className="text-xs text-amber-600 tabular-nums shrink-0">{pause.minutes} min</span>
        <button
          onClick={startEdit}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors shrink-0 ml-1"
          title="Edit pause"
        >
          ✎
        </button>
        <button
          onClick={() => onRemove(afterSceneId)}
          className="text-xs text-stone-300 hover:text-red-400 transition-colors shrink-0"
          title="Remove pause"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="my-1 flex justify-center">
      <button
        onClick={startAdd}
        className="text-xs text-stone-300 hover:text-amber-500 transition-colors px-3 py-1 rounded border border-dashed border-stone-200 hover:border-amber-300 hover:bg-amber-50"
        title="Add intermission / pause after this scene"
      >
        + Add pause
      </button>
    </div>
  );
}
