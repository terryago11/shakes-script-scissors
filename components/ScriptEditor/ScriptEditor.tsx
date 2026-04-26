"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Play, Act, Scene } from "@/types/play";
import type { LineCounts, ScriptUnitWithStatus } from "@/types/cut";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { SpeechEdit } from "@/types/edit";
import type { EditTool } from "@/lib/ui/EditModeContext";
import type { CharacterStageTime, StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime, getEffectiveCharacters } from "@/lib/cuts/StageTimeEngine";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import ActBlock from "./ActBlock";
import DiffView from "./DiffView";
import ShakespeareAnimation from "@/components/EasterEgg/ShakespeareAnimation";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";
import { useSceneJump } from "@/lib/ui/SceneJumpContext";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { useEditNav } from "@/lib/ui/EditNavContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { useMetric } from "@/lib/ui/MetricContext";
import { useSearch } from "@/lib/ui/SearchContext";
import type { EditOp } from "@/types/edit";
import { resolveSelectionToOps } from "@/lib/cuts/resolveSelection";

const DEFAULT_WPM = 135;

/** Compute line/word counts for a single scene's units (for focus mode). */
function computeFocusedLineCounts(
  units: ScriptUnitWithStatus[],
  speechEdits: Record<string, SpeechEdit>,
  assignments: ActorAssignment[],
  actors: Actor[],
): LineCounts {
  function countWords(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }

  const byCharacter: Record<string, { original: number; afterCut: number }> = {};
  const wordsByCharacter: Record<string, { original: number; afterCut: number }> = {};
  let totalOriginal = 0, totalAfterCut = 0;
  let totalWordsOriginal = 0, totalWordsAfterCut = 0;

  for (const { unit, status, lineStatuses } of units) {
    if (unit.type !== "speech") continue;
    const charId = unit.characterId;
    if (!byCharacter[charId]) {
      byCharacter[charId] = { original: 0, afterCut: 0 };
      wordsByCharacter[charId] = { original: 0, afterCut: 0 };
    }

    const lineWords = unit.lines.reduce((s, l) => s + countWords(l.text), 0);
    byCharacter[charId].original += unit.lineCount;
    wordsByCharacter[charId].original += lineWords;
    totalOriginal += unit.lineCount;
    totalWordsOriginal += lineWords;

    if (status === "cut") continue;

    const lineStatusMap = new Map((lineStatuses ?? []).map((ls) => [ls.lineId, ls.status]));
    const edit = speechEdits[unit.id];
    for (const line of unit.lines) {
      if ((lineStatusMap.get(line.id) ?? "kept") === "cut") continue;
      byCharacter[charId].afterCut += 1;
      totalAfterCut += 1;
      const ops = edit?.ops ?? [];
      if (ops.length > 0) {
        const segs = applyEditsToLine(line.id, line.text, ops);
        const keptText = segs.filter((s) => s.type !== "cut").map((s) => s.text).join("").trim();
        const w = keptText.length > 0 ? countWords(keptText) : 0;
        wordsByCharacter[charId].afterCut += w;
        totalWordsAfterCut += w;
      } else {
        const w = countWords(line.text);
        wordsByCharacter[charId].afterCut += w;
        totalWordsAfterCut += w;
      }
    }
  }

  const actorToChars: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!actorToChars[a.actorId]) actorToChars[a.actorId] = [];
    actorToChars[a.actorId].push(a.characterId);
  }
  const byActor: LineCounts["byActor"] = {};
  for (const actor of actors) {
    const chars = (actorToChars[actor.id] ?? []).filter((c) => (byCharacter[c]?.original ?? 0) > 0);
    const original = chars.reduce((s, c) => s + byCharacter[c].original, 0);
    const afterCut = chars.reduce((s, c) => s + byCharacter[c].afterCut, 0);
    if (original > 0) byActor[actor.id] = { characters: chars, original, afterCut };
  }
  const wordsByActor: LineCounts["words"]["byActor"] = {};
  for (const actor of actors) {
    const chars = (actorToChars[actor.id] ?? []).filter((c) => (wordsByCharacter[c]?.original ?? 0) > 0);
    const original = chars.reduce((s, c) => s + wordsByCharacter[c].original, 0);
    const afterCut = chars.reduce((s, c) => s + wordsByCharacter[c].afterCut, 0);
    if (original > 0) wordsByActor[actor.id] = { characters: chars, original, afterCut };
  }

  return {
    total: { original: totalOriginal, afterCut: totalAfterCut },
    byCharacter,
    byActor,
    byScene: {},
    byAct: {},
    words: {
      total: { original: totalWordsOriginal, afterCut: totalWordsAfterCut },
      byCharacter: wordsByCharacter,
      byActor: wordsByActor,
    },
  };
}

/** Estimate per-character speaking time from word counts for a focused scene. */
function computeSceneSpeakingTime(
  lineCounts: LineCounts,
  wpm: number,
): StageTimeResult {
  const byCharacter: Record<string, CharacterStageTime> = {};
  for (const [charId, counts] of Object.entries(lineCounts.words.byCharacter)) {
    byCharacter[charId] = {
      characterId: charId,
      minutes: counts.afterCut / wpm,
      originalMinutes: counts.original / wpm,
      scenes: [],
    };
  }
  return {
    byCharacter,
    totalMinutes: lineCounts.words.total.afterCut / wpm,
    originalTotalMinutes: lineCounts.words.total.original / wpm,
    pauseMinutes: 0,
    warnings: [],
  };
}

// Sentinel prefix used in the search index to distinguish unit-level entries (SDs, delivery notes)
// from line-level entries. Enables unified scroll/highlight logic with data-unit-id vs data-line-id.
const UNIT_SEARCH_PREFIX = "@u/";
function makeUnitSearchId(unitId: string) { return UNIT_SEARCH_PREFIX + unitId; }
function isUnitSearchId(id: string) { return id.startsWith(UNIT_SEARCH_PREFIX); }
function extractUnitId(id: string) { return id.slice(UNIT_SEARCH_PREFIX.length); }

/**
 * Build an ordered list of unitIds for all edits of the given tool type, in document order.
 * Each Cut field maps to the tool that created it:
 *   cut:       cutMap, lineCutMap, speechEdits[ops→cut]
 *   insert:    insertions, speechEdits[ops→insert]
 *   edit-sds:  insertedSDs (afterUnitId), stageDirectionEdits, sdTextEdits, deliveryNoteEdits
 *   reassign:  speechReassignments
 *   split:     speechSplits, partIndentOverrides
 *   song-dance: sdFlagOverrides, lineSongOverrides
 *   restore:   union of all the above
 */
function buildEditIndex(play: Play, cut: Cut, activeTool: EditTool): string[] {
  if (activeTool === "none") return [];

  const lineToUnit = new Map<string, string>();
  const unitOrder: string[] = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        unitOrder.push(unit.id);
        if (unit.type === "speech") {
          for (const line of unit.lines) lineToUnit.set(line.id, unit.id);
        }
      }
    }
  }

  const cutUnitIds = new Set<string>();
  const insertIds = new Set<string>();
  const editSdIds = new Set<string>();
  const reassignIds = new Set<string>();
  const splitIds = new Set<string>();
  const songDanceIds = new Set<string>();

  // cut: speech-level cuts, line-level cuts, and word-level cuts (drag-select)
  for (const [id, status] of Object.entries(cut.cutMap ?? {})) {
    if (status === "cut") cutUnitIds.add(id);
  }
  for (const [lineId, status] of Object.entries(cut.lineCutMap ?? {})) {
    if (status === "cut") { const uid = lineToUnit.get(lineId); if (uid) cutUnitIds.add(uid); }
  }
  for (const [unitId, edit] of Object.entries(cut.speechEdits ?? {})) {
    if (edit.ops.some((op) => op.type === "cut")) cutUnitIds.add(unitId);
  }

  // insert: inserted speech blocks + in-line word inserts
  for (const ins of Object.values(cut.insertions ?? {})) insertIds.add(ins.afterUnitId);
  for (const [unitId, edit] of Object.entries(cut.speechEdits ?? {})) {
    if (edit.ops.some((op) => op.type === "insert")) insertIds.add(unitId);
  }

  // edit-sds: inserted SDs (navigate to anchor), character list edits, SD text edits, delivery note edits
  for (const sd of Object.values(cut.insertedSDs ?? {})) editSdIds.add(sd.afterUnitId);
  for (const id of Object.keys(cut.stageDirectionEdits ?? {})) editSdIds.add(id);
  for (const id of Object.keys(cut.sdTextEdits ?? {})) editSdIds.add(id);
  for (const id of Object.keys(cut.deliveryNoteEdits ?? {})) editSdIds.add(id);

  // reassign
  for (const id of Object.keys(cut.speechReassignments ?? {})) reassignIds.add(id);

  // split/indent: speech splits (both clean line-boundary and in-line word splits) + indent overrides
  for (const id of Object.keys(cut.speechSplits ?? {})) splitIds.add(id);
  for (const lineId of Object.keys(cut.partIndentOverrides ?? {})) {
    const uid = lineToUnit.get(lineId); if (uid) splitIds.add(uid);
  }

  // song/dance: SD flag overrides + per-line song overrides
  for (const id of Object.keys(cut.sdFlagOverrides ?? {})) songDanceIds.add(id);
  for (const lineId of Object.keys(cut.lineSongOverrides ?? {})) {
    const uid = lineToUnit.get(lineId); if (uid) songDanceIds.add(uid);
  }

  let targetIds: Set<string>;
  if (activeTool === "cut") targetIds = cutUnitIds;
  else if (activeTool === "insert") targetIds = insertIds;
  else if (activeTool === "edit-sds") targetIds = editSdIds;
  else if (activeTool === "reassign") targetIds = reassignIds;
  else if (activeTool === "split") targetIds = splitIds;
  else if (activeTool === "song-dance") targetIds = songDanceIds;
  else if (activeTool === "restore") {
    targetIds = new Set([...cutUnitIds, ...insertIds, ...editSdIds, ...reassignIds, ...splitIds, ...songDanceIds]);
  } else return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const uid of unitOrder) {
    if (targetIds.has(uid) && !seen.has(uid)) { seen.add(uid); result.push(uid); }
  }
  return result;
}

interface Props {
  playId: string;
}

export default function ScriptEditor({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type FilterState = { type: "character"; id: string } | { type: "actor"; id: string } | null;
  const [filter, setFilter] = useState<FilterState>(null);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Diff mode cut pickers: null = active cut (left) / original text (right)
  const [diffLeftId, setDiffLeftId] = useState<string | null>(null);
  const [diffRightId, setDiffRightId] = useState<string | null>(null);
  const { scenes, setScenes, activeSceneId, setActiveSceneId, jumpToScene, jumpingRef, focusedSceneId, setFocusedSceneId, hiddenSceneIds, setHiddenSceneIds } = useSceneJump();
  const { activeTool, setActiveTool } = useEditMode();
  const { setEditIndex, editIndex, editIndexIdx, editNavGeneration } = useEditNav();
  const { viewMode } = useViewMode();
  const { setWpm } = useMetric();
  const { searchOpen, setSearchOpen } = useSearch();
  const scriptColRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  const pendingScrollRef = useRef<string | null>(null);
  const pendingEditScrollRef = useRef<string | null>(null);
  const [scenePickerOpen, setScenePickerOpen] = useState(false);

  // Keep MetricContext WPM in sync with project settings
  useEffect(() => {
    setWpm(project?.settings?.wordsPerMinute ?? DEFAULT_WPM);
  }, [project?.settings?.wordsPerMinute, setWpm]);

  // Esc exits edit mode; Cmd+Z / Cmd+Shift+Z undo/redo within edit mode
  useEffect(() => {
    if (activeTool === "none") return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveTool("none");
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, setActiveTool, dispatch]);

  // Highlight the current search match in the DOM
  useEffect(() => {
    const prev = scriptColRef.current?.querySelector("[data-search-current]");
    if (prev) prev.removeAttribute("data-search-current");
    if (!searchHighlightId) return;
    const isUnitEntry = isUnitSearchId(searchHighlightId);
    const attr = isUnitEntry ? `[data-unit-id="${extractUnitId(searchHighlightId)}"]` : `[data-line-id="${searchHighlightId}"]`;
    const el = scriptColRef.current?.querySelector(attr);
    if (el) el.setAttribute("data-search-current", "true");
  }, [searchHighlightId]);

  // Close scene picker on outside click
  useEffect(() => {
    if (!scenePickerOpen) return;
    function handle(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-scene-picker]")) setScenePickerOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [scenePickerOpen]);

  // After expanding a collapsed act/scene, scroll to the pending search match
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    const pending = pendingScrollRef.current;
    const isUnit = isUnitSearchId(pending);
    const attr = isUnit ? `[data-unit-id="${extractUnitId(pending)}"]` : `[data-line-id="${pending}"]`;
    const el = scriptColRef.current?.querySelector(attr);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      pendingScrollRef.current = null;
    }
  }, [collapsedActs, collapsedScenes]);

  // After expanding a collapsed act/scene, scroll to the pending edit navigation target
  useEffect(() => {
    if (!pendingEditScrollRef.current) return;
    const el = scriptColRef.current?.querySelector(`[data-unit-id="${pendingEditScrollRef.current}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      pendingEditScrollRef.current = null;
    }
  }, [collapsedActs, collapsedScenes]);

  // Cmd+F / Ctrl+F opens in-script search; Esc closes it
  useEffect(() => {
    function handleSearchKey(e: KeyboardEvent) {
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchMatchIdx(0);
        setSearchHighlightId(null);
      }
    }
    document.addEventListener("keydown", handleSearchKey);
    return () => document.removeEventListener("keydown", handleSearchKey);
  }, [searchOpen, setSearchOpen]);

  // Auto-focus input whenever search bar opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearchQuery("");
      setSearchMatchIdx(0);
      setSearchHighlightId(null);
    }
  }, [searchOpen]);

  // Sync edit index to context whenever the active tool or cut changes
  useEffect(() => {
    if (!play || !activeCut) { setEditIndex([]); return; }
    setEditIndex(buildEditIndex(play, activeCut, activeTool));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, activeCut, activeTool]);

  // Scroll to the current edit when the user navigates (editNavGeneration increments on navigate)
  useEffect(() => {
    if (editNavGeneration === 0 || !play) return;
    const unitId = editIndex[editIndexIdx];
    if (!unitId) return;

    // Find location for expand / jump
    let sceneId: string | null = null;
    let actId: string | null = null;
    outer: for (const act of play.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.id === unitId) { sceneId = scene.id; actId = act.id; break outer; }
        }
      }
    }

    let needsExpand = false;
    if (actId && collapsedActs.has(actId)) {
      setCollapsedActs((prev) => { const next = new Set(prev); next.delete(actId!); return next; });
      needsExpand = true;
    }
    if (sceneId && collapsedScenes.has(sceneId)) {
      setCollapsedScenes((prev) => { const next = new Set(prev); next.delete(sceneId!); return next; });
      needsExpand = true;
    }
    if (sceneId) jumpToScene(sceneId);

    if (needsExpand) {
      pendingEditScrollRef.current = unitId;
    } else {
      const el = scriptColRef.current?.querySelector(`[data-unit-id="${unitId}"]`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNavGeneration]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/play/${playId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Play) => {
        setPlay(data);
        setLoading(false);
        // Short labels: "1:1", "1:2", "2:1" — special acts/scenes use type abbreviations:
        //   prologue act → "pr", epilogue → "ep", induction → "in"
        //   chorus scene → "ch" (e.g. "3:ch"), scene epilogue/prologue → "ep"/"pr"
        const scenesList: { id: string; label: string }[] = [];
        data.acts.forEach((act) => {
          const actPrefix = act.divType === "prologue" ? "pr"
            : act.divType === "epilogue" ? "ep"
            : act.divType === "induction" ? "in"
            : String(act.number);
          act.scenes.forEach((scene, si) => {
            const sceneLabel = scene.sceneType === "chorus" ? "ch"
              : scene.sceneType === "epilogue" ? "ep"
              : scene.sceneType === "prologue" ? "pr"
              : String(si + 1);
            scenesList.push({ id: scene.id, label: `${actPrefix}:${sceneLabel}` });
          });
        });
        setScenes(scenesList);
        if (scenesList.length > 0) {
          setActiveSceneId(scenesList[0].id);
        }
      })
      .catch((e) => {
        setError(String(e.message));
        setLoading(false);
      });
  }, [playId, setScenes]);

  // Update hidden scene IDs in the context when the character/actor filter changes.
  // Hidden scenes are those where the filtered character has no speeches.
  useEffect(() => {
    if (!play) return;
    if (!filter) {
      setHiddenSceneIds(new Set());
      return;
    }
    // Resolve filter to a set of character IDs (actor filter → map to characters)
    const charIds = new Set<string>();
    if (filter.type === "character") {
      charIds.add(filter.id);
    } else {
      project?.assignments
        .filter((a) => a.actorId === filter.id)
        .forEach((a) => charIds.add(a.characterId));
    }
    if (charIds.size === 0) { setHiddenSceneIds(new Set()); return; }
    const hidden = new Set<string>();
    for (const act of play.acts) {
      for (const scene of act.scenes) {
        const hasChar = scene.units.some(
          (u) => u.type === "speech" && charIds.has(u.characterId)
        );
        if (!hasChar) hidden.add(scene.id);
      }
    }
    setHiddenSceneIds(hidden);
  }, [filter, play, project?.assignments, setHiddenSceneIds]);

  // Track which scene is at the top of the viewport
  useEffect(() => {
    if (!play) return;
    const sceneIds = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sceneId = entry.target.id.replace(/^scene-/, "");
          ratios.set(sceneId, entry.intersectionRatio);
        }
        const visible = sceneIds.filter((id) => (ratios.get(id) ?? 0) > 0);
        if (visible.length > 0 && !jumpingRef.current) setActiveSceneId(visible[0]);
      },
      { rootMargin: "-56px 0px -40% 0px", threshold: [0, 0.1, 0.5, 1.0] }
    );
    const timeout = setTimeout(() => {
      for (const id of sceneIds) {
        const el = document.getElementById(`scene-${id}`);
        if (el) observer.observe(el);
      }
    }, 100);
    return () => { clearTimeout(timeout); observer.disconnect(); };
  }, [play, setActiveSceneId, collapsedActs]);

  // Reset diff pickers if their referenced cuts are deleted
  useEffect(() => {
    if (!project) return;
    if (diffLeftId && !project.cuts.find((c) => c.id === diffLeftId)) setDiffLeftId(null);
    if (diffRightId && !project.cuts.find((c) => c.id === diffRightId)) setDiffRightId(null);
  }, [project?.cuts, diffLeftId, diffRightId]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-stone-400">Loading {playId}…</div>;
  }
  if (error || !play) {
    return <div className="flex items-center justify-center py-24 text-red-500">Failed to load play: {error}</div>;
  }
  if (!project || !activeCut) return null;

  // Map lineId / unitId → { sceneId, actId } for search auto-expand and edit nav
  const lineToLocation = new Map<string, { sceneId: string; actId: string }>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        lineToLocation.set(unit.id, { sceneId: scene.id, actId: act.id });
        if (unit.type === "speech") {
          for (const line of unit.lines) {
            lineToLocation.set(line.id, { sceneId: scene.id, actId: act.id });
          }
        }
      }
    }
  }
  // Inserted SDs: map their id → location of their afterUnitId (same scene)
  for (const isd of Object.values(activeCut.insertedSDs ?? {})) {
    const loc = lineToLocation.get(isd.afterUnitId);
    if (loc) lineToLocation.set(isd.id, loc);
  }

  // Map sceneId → { actTitle, sceneTitle } for context strip
  const sceneContextMap = new Map<string, { actTitle: string; sceneTitle: string }>();
  for (const act of play.acts) {
    const actTitle = act.divType === "prologue" ? "Prologue"
      : act.divType === "epilogue" ? "Epilogue"
      : act.divType === "induction" ? "Induction"
      : act.title;
    for (const scene of act.scenes) {
      sceneContextMap.set(scene.id, { actTitle, sceneTitle: scene.title });
    }
  }

  const contextLabel = (() => {
    if (!activeSceneId) return null;
    const ctx = sceneContextMap.get(activeSceneId);
    if (!ctx) return null;
    return `${ctx.actTitle} · ${ctx.sceneTitle}`;
  })();

  // Original play units — unexpanded, no cut filtering — used by DiffView's right (original) column
  const origUnitsByScene = new Map<string, import("@/types/play").ScriptUnit[]>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      origUnitsByScene.set(scene.id, scene.units);
    }
  }

  const { unitsByScene, lineCounts } = computeCuts(
    play,
    activeCut,
    project.assignments,
    project.actors
  );

  // Diff mode: resolve left/right cuts (declared here so search index can use them)
  const leftDiffCut = diffLeftId ? (project.cuts.find((c) => c.id === diffLeftId) ?? activeCut) : activeCut;
  const rightDiffCut = diffRightId ? (project.cuts.find((c) => c.id === diffRightId) ?? null) : null;
  const diffLeftUnits = (viewMode === "diff" && diffLeftId && diffLeftId !== activeCut.id)
    ? computeCuts(play, leftDiffCut, project.assignments, project.actors).unitsByScene
    : unitsByScene;
  const diffRightUnits = (viewMode === "diff" && rightDiffCut && play)
    ? computeCuts(play, rightDiffCut, project.assignments, project.actors).unitsByScene
    : undefined;
  const diffRightSpeechEdits = rightDiffCut?.speechEdits;

  // Build flat search index. Scope depends on view mode:
  //   standard — all speeches + SDs + inserted SDs + delivery notes (including cut items)
  //   clean    — only kept speeches/SDs/lines
  //   diff     — left column + right column speeches, deduplicated by lineId; SDs from left only
  // Unit-level entries (SDs, delivery notes) use makeUnitSearchId(unitId) so scroll logic can distinguish them.
  type SearchEntry = { lineId: string; text: string };
  const searchIndex: SearchEntry[] = [];

  if (viewMode === "clean") {
    for (const units of unitsByScene.values()) {
      for (const { unit, status, lineStatuses } of units) {
        if (status === "cut") continue;
        if (unit.type === "speech") {
          if (unit.lines.length > 0) searchIndex.push({ lineId: unit.lines[0].id, text: unit.characterName });
          if (unit.deliveryNote) searchIndex.push({ lineId: makeUnitSearchId(unit.id), text: unit.deliveryNote });
          const lineStatusMap = new Map((lineStatuses ?? []).map((ls) => [ls.lineId, ls.status]));
          for (const line of unit.lines) {
            if ((lineStatusMap.get(line.id) ?? "kept") !== "cut") {
              searchIndex.push({ lineId: line.id, text: line.text });
            }
          }
        } else if (unit.type === "stage") {
          const effectiveText = activeCut.sdTextEdits?.[unit.id] ?? unit.text;
          searchIndex.push({ lineId: makeUnitSearchId(unit.id), text: effectiveText });
        }
      }
    }
    // Inserted SDs in clean mode (only kept ones — they're never in unitsByScene so add separately)
    for (const isd of Object.values(activeCut.insertedSDs ?? {})) {
      if ((activeCut.cutMap[isd.id] ?? "kept") !== "cut") {
        searchIndex.push({ lineId: makeUnitSearchId(isd.id), text: isd.text });
      }
    }
  } else {
    // standard or diff: include all speeches (cut or kept) from the left/main column
    for (const units of unitsByScene.values()) {
      for (const { unit } of units) {
        if (unit.type === "speech") {
          if (unit.lines.length > 0) searchIndex.push({ lineId: unit.lines[0].id, text: unit.characterName });
          if (unit.deliveryNote) searchIndex.push({ lineId: makeUnitSearchId(unit.id), text: unit.deliveryNote });
          for (const line of unit.lines) {
            searchIndex.push({ lineId: line.id, text: line.text });
          }
        } else if (unit.type === "stage") {
          const effectiveText = activeCut.sdTextEdits?.[unit.id] ?? unit.text;
          searchIndex.push({ lineId: makeUnitSearchId(unit.id), text: effectiveText });
        }
      }
    }
    // Inserted SDs (all, including cut ones in standard mode)
    for (const isd of Object.values(activeCut.insertedSDs ?? {})) {
      searchIndex.push({ lineId: makeUnitSearchId(isd.id), text: isd.text });
    }
    // diff: also search right column speeches, deduplicated
    if (viewMode === "diff") {
      const seen = new Set(searchIndex.map((e) => e.lineId));
      const rightSrc = diffRightUnits ?? origUnitsByScene;
      for (const units of rightSrc.values()) {
        for (const u of units) {
          const unit = "unit" in u ? u.unit : u;
          if (unit.type !== "speech") continue;
          for (const line of unit.lines) {
            if (!seen.has(line.id)) { seen.add(line.id); searchIndex.push({ lineId: line.id, text: line.text }); }
          }
        }
      }
    }
  }
  const searchMatches = searchQuery.trim()
    ? searchIndex.filter((e) => e.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  const clampedMatchIdx = searchMatches.length > 0 ? searchMatchIdx % searchMatches.length : 0;
  const currentMatch = searchMatches[clampedMatchIdx] ?? null;

  const stageTime = computeStageTime(play, activeCut, project.settings);

  const focusedLineCounts: LineCounts | null = focusedSceneId
    ? computeFocusedLineCounts(
        unitsByScene.get(focusedSceneId) ?? [],
        activeCut.speechEdits ?? {},
        project.assignments,
        project.actors,
      )
    : null;

  // Time tab in focus mode: estimated speaking time from word counts
  const focusedStageTime: StageTimeResult | null = focusedLineCounts
    ? computeSceneSpeakingTime(focusedLineCounts, project.settings?.wordsPerMinute ?? DEFAULT_WPM)
    : null;

  function handleToggle(unitId: string) {
    dispatch({ type: "TOGGLE_UNIT", unitId });
  }

  function handleRestoreScene() {
    setEasterEggVisible(true);
  }

  function handleClearEdits(unitId: string) {
    dispatch({ type: "CLEAR_SPEECH_EDITS", unitId });
  }

  function handleReassign(unitId: string, characterIds: string[] | null) {
    dispatch({ type: "REASSIGN_SPEECH", unitId, characterIds });
  }

  function toggleAct(actId: string) {
    const isCollapsing = !collapsedActs.has(actId);
    setCollapsedActs((prev) => {
      const next = new Set(prev);
      isCollapsing ? next.add(actId) : next.delete(actId);
      return next;
    });
    if (isCollapsing) {
      const actScenes = play!.acts.find((a) => a.id === actId)?.scenes ?? [];
      setCollapsedScenes((prev) => {
        const next = new Set(prev);
        actScenes.forEach((s) => next.delete(s.id));
        return next;
      });
    }
  }

  function toggleScene(sceneId: string) {
    setCollapsedScenes((prev) => {
      const next = new Set(prev);
      next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId);
      return next;
    });
  }

  function scrollToMatch(matches: SearchEntry[], idx: number) {
    const match = matches[idx % matches.length];
    if (!match) return;
    setSearchHighlightId(match.lineId);
    const isUnit = isUnitSearchId(match.lineId);
    const lookupId = isUnit ? extractUnitId(match.lineId) : match.lineId;
    const loc = lineToLocation.get(lookupId);
    let needsExpand = false;
    if (loc) {
      if (collapsedActs.has(loc.actId)) {
        setCollapsedActs((prev) => { const next = new Set(prev); next.delete(loc.actId); return next; });
        needsExpand = true;
      }
      if (collapsedScenes.has(loc.sceneId)) {
        setCollapsedScenes((prev) => { const next = new Set(prev); next.delete(loc.sceneId); return next; });
        needsExpand = true;
      }
    }
    if (needsExpand) {
      pendingScrollRef.current = match.lineId;
    } else {
      const attr = isUnit ? `[data-unit-id="${lookupId}"]` : `[data-line-id="${lookupId}"]`;
      const el = scriptColRef.current?.querySelector(attr);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function handleSearchNext() {
    const next = searchMatches.length > 0 ? (clampedMatchIdx + 1) % searchMatches.length : 0;
    setSearchMatchIdx(next);
    scrollToMatch(searchMatches, next);
  }

  function handleSearchPrev() {
    const prev = searchMatches.length > 0 ? (clampedMatchIdx - 1 + searchMatches.length) % searchMatches.length : 0;
    setSearchMatchIdx(prev);
    scrollToMatch(searchMatches, prev);
  }

  function handleSearchQueryChange(q: string) {
    setSearchQuery(q);
    setSearchMatchIdx(0);
    const newMatches = q.trim()
      ? searchIndex.filter((e) => e.text.toLowerCase().includes(q.toLowerCase()))
      : [];
    if (newMatches.length > 0) scrollToMatch(newMatches, 0);
    else setSearchHighlightId(null);
  }

  function handleSplit(unitId: string, atLineIndex: number, atWordOffset?: number) {
    dispatch({ type: "SPLIT_SPEECH", unitId, splitAtLineIndex: atLineIndex, splitAtWordOffset: atWordOffset });
  }

  function handleMerge(unitId: string, part2LineIds: string[]) {
    dispatch({ type: "MERGE_SPEECH", unitId, part2LineIds });
  }

  function handleAddInsertion(insertion: import("@/types/insertion").Insertion) {
    dispatch({ type: "ADD_INSERTION", insertion });
  }

  function handleRemoveInsertion(insertionId: string, lineIds: string[]) {
    dispatch({ type: "REMOVE_INSERTION", insertionId, lineIds });
  }

  function handleScriptMouseUp() {
    if (activeTool !== "cut" || !scriptColRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const targets = resolveSelectionToOps(range, scriptColRef.current);
    if (targets.length === 0) return;

    const speechLines = new Map<string, Array<{ id: string; text: string }>>();
    for (const act of play!.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") speechLines.set(unit.id, unit.lines);
        }
      }
    }

    const byUnit = new Map<string, typeof targets>();
    for (const t of targets) {
      const arr = byUnit.get(t.unitId) ?? [];
      arr.push(t);
      byUnit.set(t.unitId, arr);
    }

    const unitCuts: string[] = [];
    const wordOps: Array<{ unitId: string; op: EditOp }> = [];

    for (const [unitId, unitTargets] of byUnit) {
      const lines = speechLines.get(unitId);
      if (lines && lines.length > 0) {
        const targetMap = new Map(unitTargets.map((t) => [t.lineId, t]));
        const allCovered = lines.every((line) => {
          const t = targetMap.get(line.id);
          return t && t.start === 0 && t.end >= line.text.length;
        });
        if (allCovered) { unitCuts.push(unitId); continue; }
      }
      for (const t of unitTargets) {
        wordOps.push({ unitId, op: { type: "cut" as const, lineId: t.lineId, start: t.start, end: t.end } });
      }
    }

    for (const unitId of unitCuts) {
      dispatch({ type: "SET_UNIT_STATUS", unitId, status: "cut" });
    }
    if (wordOps.length > 0) {
      dispatch({ type: "BULK_ADD_EDIT_OPS", ops: wordOps });
    }
    sel.removeAllRanges();
  }

  function handleFilterCharacter(characterId: string | null) {
    if (!characterId) { setFilter(null); return; }
    setFilter((prev) =>
      prev?.type === "character" && prev.id === characterId ? null : { type: "character", id: characterId }
    );
  }

  function handleFilterActor(actorId: string | null) {
    if (!actorId) { setFilter(null); return; }
    setFilter((prev) =>
      prev?.type === "actor" && prev.id === actorId ? null : { type: "actor", id: actorId }
    );
  }

  const filteredCharacterIds: Set<string> = (() => {
    if (!filter || !project) return new Set();
    if (filter.type === "character") return new Set([filter.id]);
    return new Set(project.assignments.filter((a) => a.actorId === filter.id).map((a) => a.characterId));
  })();

  const filterLabel = (() => {
    if (!filter || !play) return null;
    if (filter.type === "character") return play.castList.find((c) => c.id === filter.id)?.name ?? filter.id;
    const actor = project?.actors.find((a) => a.id === filter.id);
    return actor ? actor.name : filter.id;
  })();

  const defaultSceneOrder = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
  const effectiveSceneOrder = activeCut.sceneOrder ?? defaultSceneOrder;

  const sceneMap = new Map<string, Scene>();
  const sceneActMap = new Map<string, Act>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, scene);
      sceneActMap.set(scene.id, act);
    }
  }

  type OrderedGroup = { act: Act; scenes: Scene[] };
  const orderedGroups: OrderedGroup[] = [];
  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneMap.get(sceneId);
    const act = sceneActMap.get(sceneId);
    if (!scene || !act) continue;
    const last = orderedGroups[orderedGroups.length - 1];
    if (last && last.act.id === act.id) {
      last.scenes.push(scene);
    } else {
      orderedGroups.push({ act, scenes: [scene] });
    }
  }

  const focusedSceneTitle = (() => {
    if (!focusedSceneId) return null;
    for (const act of play.acts) {
      const s = act.scenes.find((s) => s.id === focusedSceneId);
      if (s) return `${act.title} · ${s.title}`;
    }
    return null;
  })();

  // Characters that appear in at least one kept entrance SD (used for reassign warnings)
  const charsWithEntrance = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "stage" && unit.stageType === "entrance") {
          if ((activeCut.cutMap[unit.id] ?? "kept") === "kept") {
            const effChars = getEffectiveCharacters(unit, activeCut.stageDirectionEdits);
            for (const charId of effChars) charsWithEntrance.add(charId);
          }
        }
      }
    }
  }

  const sharedActBlockProps = {
    unitsByScene,
    assignments: project.assignments,
    actors: project.actors,
    castList: play.castList,
    filteredCharacterIds,
    focusedSceneId,
    pauses: activeCut.pauses,
    speechReassignments: activeCut.speechReassignments ?? {},
    charsWithEntrance,
    onReassign: handleReassign,
    characterAliases: activeCut.characterAliases,
    stageDirectionEdits: activeCut.stageDirectionEdits,
    speechSplits: activeCut.speechSplits,
    onSplit: handleSplit,
    onMerge: handleMerge,
    insertions: activeCut.insertions,
    onAddInsertion: handleAddInsertion,
    onRemoveInsertion: handleRemoveInsertion,
    insertedSDs: activeCut.insertedSDs,
    onRestoreScene: handleRestoreScene,
    activeCut,
  };

  return (
    <>
    {/* Focus mode strip — same shape/size as context strip, fixed below navbar */}
    {focusedSceneId && viewMode !== "diff" && !searchOpen && (
      <div className="no-print fixed top-14 left-0 right-0 z-10">
        <div className="flex items-center bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border-b border-amber-200 dark:border-amber-900">
          <button
            onClick={() => setFocusedSceneId(null)}
            title="Exit focus"
            className="shrink-0 px-3 py-1 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-100/95 dark:hover:bg-amber-900/95 transition-colors border-r border-amber-200 dark:border-amber-900 text-sm"
          >
            ◉
          </button>
          <span className="flex-1 text-xs text-amber-700 dark:text-amber-400 font-medium tracking-wide px-3 py-1">
            {focusedSceneTitle ?? "Focused scene"}
          </span>
        </div>
      </div>
    )}

    {/* Context strip — fixed below navbar, doubles as scene jumper + focus toggle */}
    {contextLabel && !focusedSceneId && viewMode !== "diff" && !searchOpen && (
      <div data-scene-picker className="no-print fixed top-14 left-0 right-0 z-10">
        <div className="flex items-center bg-white/95 dark:bg-stone-950/95 backdrop-blur-sm border-b border-stone-100 dark:border-stone-800">
          {/* Focus toggle */}
          <button
            onClick={() => activeSceneId && setFocusedSceneId(activeSceneId)}
            title="Focus on current scene"
            className="shrink-0 px-3 py-1 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-50/95 dark:hover:bg-stone-900/95 transition-colors border-r border-stone-100 dark:border-stone-800 text-sm"
          >
            ○
          </button>
          {/* Scene picker trigger */}
          <button
            onClick={() => setScenePickerOpen((o) => !o)}
            className="flex-1 flex items-center gap-1.5 px-3 py-1 hover:bg-stone-50/95 dark:hover:bg-stone-900/95 transition-colors text-left"
          >
            <span className="text-xs text-stone-400 dark:text-stone-500 font-medium tracking-wide flex-1">
              {contextLabel}
            </span>
            <svg
              className={`w-3 h-3 text-stone-400 dark:text-stone-500 shrink-0 transition-transform ${scenePickerOpen ? "rotate-180" : ""}`}
              viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <path d="M1 1l4 4 4-4"/>
            </svg>
          </button>
        </div>
        {scenePickerOpen && (
          <div className="absolute top-full left-0 right-0 max-h-64 overflow-y-auto bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shadow-md">
            {scenes.map((scene) => {
              const ctx = sceneContextMap.get(scene.id);
              const isActive = scene.id === activeSceneId;
              const isHidden = hiddenSceneIds.has(scene.id);
              return (
                <button
                  key={scene.id}
                  disabled={isHidden}
                  onClick={() => { setActiveSceneId(scene.id); jumpToScene(scene.id); setScenePickerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-1.5 text-left text-xs transition-colors ${
                    isHidden ? "text-stone-300 dark:text-stone-600 cursor-default"
                    : isActive ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                  }`}
                >
                  <span className="tabular-nums font-mono text-stone-400 dark:text-stone-500 shrink-0 w-8">{scene.label}</span>
                  <span>{ctx ? `${ctx.actTitle} · ${ctx.sceneTitle}` : scene.id}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    )}
    <div className="max-w-screen-xl mx-auto flex gap-0">
      {/* Script column */}
      <div
        ref={scriptColRef}
        className={`flex-1 min-w-0 overflow-y-auto ${activeTool === "cut" ? "cursor-crosshair select-text" : ""}`}
        onMouseUp={handleScriptMouseUp}
      >
        {/* Filter badge — shown when filtering by character/actor */}
        {filterLabel && viewMode !== "diff" && (
          <div className="no-print sticky top-14 z-20 bg-white dark:bg-stone-950">
            <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 px-2 py-1 rounded">
                <span>Showing: <strong>{filterLabel}</strong></span>
                <button onClick={() => setFilter(null)} className="text-amber-500 hover:text-amber-700 font-medium ml-1">✕</button>
              </div>
            </div>
          </div>
        )}

        {/* In-script search bar — fixed so it floats over the content regardless of scroll position */}
        {searchOpen && (
          <div className="no-print fixed top-14 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800 px-4 py-2 flex items-center gap-2 shadow-sm">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.shiftKey ? handleSearchPrev() : handleSearchNext(); }
                if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setSearchMatchIdx(0); }
              }}
              placeholder="Find in script…"
              className="flex-1 min-w-0 text-sm bg-transparent border border-stone-300 dark:border-stone-600 rounded px-2.5 py-1 outline-none focus:border-amber-400 dark:focus:border-amber-500 dark:text-stone-100 placeholder:text-stone-400"
            />
            <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0 tabular-nums min-w-[4rem] text-center">
              {searchQuery.trim() ? (searchMatches.length > 0 ? `${clampedMatchIdx + 1} / ${searchMatches.length}` : "0 results") : ""}
            </span>
            <button
              onClick={handleSearchPrev}
              disabled={searchMatches.length === 0}
              className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
              title="Previous match (Shift+Enter)"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9l4-4 4 4"/></svg>
            </button>
            <button
              onClick={handleSearchNext}
              disabled={searchMatches.length === 0}
              className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30"
              title="Next match (Enter)"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7l4 4 4-4"/></svg>
            </button>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchMatchIdx(0); }}
              className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              title="Close (Esc)"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
        )}

        {/* Diff mode: true paired-row DiffView */}
        {viewMode === "diff" ? (
          <DiffView
            orderedGroups={orderedGroups}
            unitsByScene={diffLeftUnits}
            origUnitsByScene={origUnitsByScene}
            insertions={leftDiffCut.insertions}
            speechEdits={leftDiffCut.speechEdits}
            assignments={project.assignments}
            actors={project.actors}
            castList={play.castList}
            filteredCharacterIds={filteredCharacterIds}
            focusedSceneId={focusedSceneId}
            onToggle={handleToggle}
            onClearEdits={handleClearEdits}
            characterAliases={leftDiffCut.characterAliases}
            cuts={project.cuts}
            activeCutId={activeCut.id}
            diffLeftId={diffLeftId}
            diffRightId={diffRightId}
            onSetDiffLeft={setDiffLeftId}
            onSetDiffRight={setDiffRightId}
            rightUnitsByScene={diffRightUnits}
            rightSpeechEdits={diffRightSpeechEdits}
            activeCut={leftDiffCut}
          />
        ) : (
          <div className={`px-4 pb-6 ${
            (focusedSceneId || contextLabel) && filterLabel ? "pt-24"
            : (focusedSceneId || contextLabel) ? "pt-12"
            : filterLabel ? "pt-16"
            : "pt-6"
          }`}>
            {orderedGroups.map((group) => (
              <ActBlock
                key={`${group.act.id}-${group.scenes[0].id}`}
                act={group.act}
                scenes={group.scenes}
                collapsed={collapsedActs.has(group.act.id)}
                onToggleCollapsed={() => toggleAct(group.act.id)}
                collapsedScenes={collapsedScenes}
                onToggleScene={toggleScene}
                onToggle={handleToggle}
                speechEdits={activeCut.speechEdits}
                onClearEdits={handleClearEdits}
                lineCounts={lineCounts}
                {...sharedActBlockProps}
              />
            ))}
          </div>
        )}
      </div>

      {/* Line count panel — desktop: right sidebar; hidden in diff mode */}
      {viewMode !== "diff" && (
        <div className="no-print hidden lg:block w-72 shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
          <LineCountPanel
            play={play}
            lineCounts={focusedLineCounts ?? lineCounts}
            actors={project.actors}
            assignments={project.assignments}
            filter={filter}
            onFilterCharacter={handleFilterCharacter}
            onFilterActor={handleFilterActor}
            stageTime={focusedStageTime ?? stageTime}
            settings={project.settings}
            isFocused={!!focusedSceneId}
            characterAliases={activeCut.characterAliases}
          />
        </div>
      )}

      {/* Line count panel — tablet bottom drawer (md: only, hidden on desktop and mobile) */}
      {viewMode !== "diff" && panelOpen && (
        <div className="lg:hidden no-print fixed bottom-0 inset-x-0 z-40 h-64 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 overflow-y-auto shadow-lg">
          <LineCountPanel
            play={play}
            lineCounts={focusedLineCounts ?? lineCounts}
            actors={project.actors}
            assignments={project.assignments}
            filter={filter}
            onFilterCharacter={handleFilterCharacter}
            onFilterActor={handleFilterActor}
            stageTime={focusedStageTime ?? stageTime}
            settings={project.settings}
            isFocused={!!focusedSceneId}
            characterAliases={activeCut.characterAliases}
          />
        </div>
      )}

      {/* Drawer toggle — all screen sizes below lg: */}
      {viewMode !== "diff" && (
        <button
          className="no-print lg:hidden fixed bottom-16 left-4 z-50 px-3 py-2 text-sm font-medium rounded-full shadow-md bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label={panelOpen ? "Close line counts" : "Show line counts"}
        >
          {panelOpen ? "✕ Close" : "≡ Info"}
        </button>
      )}

      {/* Easter egg animation */}
      <ShakespeareAnimation
        variant="restore"
        visible={easterEggVisible}
        onDismiss={() => setEasterEggVisible(false)}
      />
    </div>
    </>
  );
}
