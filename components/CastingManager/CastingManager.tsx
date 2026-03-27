"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Play, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeQuickChanges } from "@/lib/cuts/QuickChangeEngine";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";
import { suggestMinimumCast, buildForbiddenPairs } from "@/lib/cuts/CastingUtils";
import { defaultColors, generateId } from "@/lib/project/projectUtils";
import type { Actor, ActorAssignment } from "@/types/project";
import CharacterCard from "./CharacterCard";

interface Props {
  playId: string;
}

/** Returns the effective character list for an SD, applying any overrides. */
function getEffectiveChars(sd: StageDirection, edits?: Record<string, string[]>): string[] {
  return edits?.[sd.id] ?? sd.characters;
}


/**
 * Per-scene on-stage walk using entrance/exit SDs (mirrors StageTimeEngine logic).
 * Returns Map<characterId, Set<characterId>> of characters that were EVER simultaneously
 * on stage at the same moment (not just the same scene).
 */
function computeSimultaneousMap(
  play: Play,
  cutMap: Record<string, "cut" | "kept">,
  edits?: Record<string, string[]>
): Map<string, Set<string>> {
  const simMap = new Map<string, Set<string>>();

  function recordPairs(onStage: Set<string>) {
    const list = Array.from(onStage);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!simMap.has(a)) simMap.set(a, new Set());
        if (!simMap.has(b)) simMap.set(b, new Set());
        simMap.get(a)!.add(b);
        simMap.get(b)!.add(a);
      }
    }
  }

  for (const act of play.acts) {
    for (const scene of act.scenes) {
      // On-stage set — populated ONLY by entrance/exit SDs (no speech fallback)
      const onStage = new Set<string>();

      // Walk units — after each entrance, snapshot simultaneous pairs
      for (const unit of scene.units) {
        if (unit.type === "stage") {
          if (unit.stageType === "entrance") {
            for (const charId of getEffectiveChars(unit, edits)) {
              onStage.add(charId);
            }
            recordPairs(onStage);
          } else if (unit.stageType === "exit") {
            for (const charId of getEffectiveChars(unit, edits)) {
              onStage.delete(charId);
            }
          }
        }
      }
    }
  }

  return simMap;
}

type ActorSort = "az" | "lines" | "words" | "time" | "first";

export default function CastingManager({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? "";
  const [play, setPlay] = useState<Play | null>(null);
  const [newActorName, setNewActorName] = useState("");
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [editingActorName, setEditingActorName] = useState("");
  const [confirmDeleteActorId, setConfirmDeleteActorId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [actorSort, setActorSort] = useState<ActorSort>("az");
  const [fullCastBannerDismissed, setFullCastBannerDismissed] = useState(false);

  // #16 Suggest state machine
  type SuggestedGroup = { actorIndex: number; charIds: string[] };
  type SuggestState =
    | { phase: "idle" }
    | { phase: "choosing" }
    | { phase: "preview"; groups: SuggestedGroup[]; mode: "replace" | "extend" };
  const [suggestState, setSuggestState] = useState<SuggestState>({ phase: "idle" });

  const threshold = project?.settings?.quickChangeThresholdMinutes ?? 2.0;
  const minActorStageTime = project?.settings?.minActorStageTimeMinutes ?? 10;

  useEffect(() => {
    fetch(`/api/play/${playId}`)
      .then((r) => r.json())
      .then(setPlay);
  }, [playId]);

  if (!project || !play) {
    return <div className="text-stone-400 dark:text-stone-400 text-sm p-6">Loading…</div>;
  }

  function handleAddActor() {
    const name = newActorName.trim();
    if (!name) return;
    dispatch({ type: "ADD_ACTOR", name });
    setNewActorName("");
  }

  function handleSuggest() {
    if (!activeCut) return;
    // If actors already exist, ask Replace or Extend first
    if (project!.actors.length > 0) {
      setSuggestState({ phase: "choosing" });
      return;
    }
    runSuggest("replace");
  }

  function runSuggest(mode: "replace" | "extend") {
    if (!activeCut) return;

    const unassignedOnly = mode === "extend";

    const activeChars = speakingChars.filter((c) => {
      if (fullyCutCharIds.has(c.id)) return false;
      if (unassignedOnly && charToActor[c.id]) return false;
      return true;
    });

    if (activeChars.length === 0) {
      // All assigned already
      setSuggestState({ phase: "idle" });
      return;
    }

    const activeCharIds = activeChars.map((c) => c.id);

    // Resolve display name for a character (alias → castList → TEI fallback)
    function displayName(id: string): string {
      return (
        activeCut?.characterAliases?.[id] ??
        speakingChars.find((c) => c.id === id)?.name ??
        characterIdToName(id)
      );
    }

    // ── sameActorPairs: characters that share the same display name ────────
    const nameGroups = new Map<string, string[]>();
    for (const c of activeChars) {
      const n = displayName(c.id);
      if (!nameGroups.has(n)) nameGroups.set(n, []);
      nameGroups.get(n)!.push(c.id);
    }
    const sameActorPairs: Array<[string, string]> = [];
    for (const group of nameGroups.values()) {
      if (group.length < 2) continue;
      for (let i = 1; i < group.length; i++) {
        const simSet = simultaneousMap.get(group[0]) ?? new Set();
        if (!simSet.has(group[i])) {
          sameActorPairs.push([group[0], group[i]]);
        }
      }
    }

    const forbiddenPairs = buildForbiddenPairs(play!, activeCut, project?.settings);

    const linkPairs = (activeCut?.characterLinks ?? []).filter(
      ([a, b]) => activeCharIds.includes(a) && activeCharIds.includes(b)
    );
    const allSameActorPairs = [...sameActorPairs, ...linkPairs];

    const lineCountsForSuggest: Record<string, number> = {};
    for (const c of activeChars) {
      lineCountsForSuggest[c.id] = lineCounts?.byCharacter[c.id]?.afterCut ?? 0;
    }

    const result = suggestMinimumCast(activeCharIds, simultaneousMap, {
      lineCounts: lineCountsForSuggest,
      forbiddenPairs,
      sameActorPairs: allSameActorPairs,
    });

    const groups = new Map<number, string[]>();
    for (const { charId, actorIndex } of result) {
      if (!groups.has(actorIndex)) groups.set(actorIndex, []);
      groups.get(actorIndex)!.push(charId);
    }
    const sortedGroups = Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([actorIndex, charIds]) => ({ actorIndex, charIds }));

    setSuggestState({ phase: "preview", groups: sortedGroups, mode });
  }

  function handleApplySuggestion() {
    if (suggestState.phase !== "preview") return;
    const { groups, mode } = suggestState;

    const existingCount = project!.actors.length;
    const usedColors = new Set(project!.actors.map((a) => a.color));
    const newActors: Actor[] = groups.map((g, i) => {
      const color = defaultColors.find((c) => !usedColors.has(c)) || defaultColors[i % defaultColors.length];
      usedColors.add(color);
      return {
        id: generateId(),
        name: `Actor ${existingCount + g.actorIndex + 1}`,
        color,
      };
    });
    const newAssignments: ActorAssignment[] = [];
    for (let i = 0; i < groups.length; i++) {
      const actorId = newActors[i].id;
      for (const charId of groups[i].charIds) {
        newAssignments.push({ characterId: charId, actorId });
      }
    }

    if (mode === "replace") {
      // Name actors 1..N (ignoring existingCount for replace)
      const replaceActors: Actor[] = groups.map((g, i) => ({
        id: newActors[i].id,
        name: `Actor ${g.actorIndex + 1}`,
        color: defaultColors[i % defaultColors.length],
      }));
      dispatch({ type: "BULK_SET_CAST", actors: replaceActors, assignments: newAssignments });
    } else {
      dispatch({ type: "EXTEND_CAST", actors: newActors, assignments: newAssignments });
    }
    setSuggestState({ phase: "idle" });
  }

  // Build character → actor lookup
  const charToActor: Record<string, string> = {};
  for (const a of project.assignments) {
    charToActor[a.characterId] = a.actorId;
  }

  // Only show characters that have at least one line
  const speakingCharIds = new Set<string>();
  const allSpeeches: Array<{ id: string; characterId: string }> = [];
  // Collect entrance/exit SDs per character (using effective character list)
  const sdsByChar = new Map<string, Array<{ id: string }>>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          speakingCharIds.add(unit.characterId);
          allSpeeches.push({ id: unit.id, characterId: unit.characterId });
        } else if (unit.type === "stage" && (unit.stageType === "entrance" || unit.stageType === "exit")) {
          for (const charId of getEffectiveChars(unit, activeCut?.stageDirectionEdits)) {
            if (!sdsByChar.has(charId)) sdsByChar.set(charId, []);
            sdsByChar.get(charId)!.push({ id: unit.id });
          }
        }
      }
    }
  }
  const speakingChars = play.castList.filter((c) => speakingCharIds.has(c.id));

  // Fully-cut: all speeches AND all entrance/exit SDs for the character must be cut
  const fullyCutCharIds = new Set<string>(
    [...speakingCharIds].filter((charId) => {
      const speeches = allSpeeches.filter((s) => s.characterId === charId);
      const sds = sdsByChar.get(charId) ?? [];
      const allSpeechesCut = speeches.length > 0 && speeches.every((s) => activeCut?.cutMap[s.id] === "cut");
      const allSdsCut = sds.every((sd) => activeCut?.cutMap[sd.id] === "cut");
      return allSpeechesCut && allSdsCut;
    })
  );

  // Compute line/word/time counts for each character in this cut
  const { lineCounts } = activeCut
    ? computeCuts(play, activeCut, project.assignments, project.actors)
    : { lineCounts: { byCharacter: {}, words: { byCharacter: {} } } as never };
  const stageTime = activeCut ? computeStageTime(play, activeCut, project.settings) : null;

  // Build simultaneous map (chars that are ever on stage at the same moment in the cut)
  const simultaneousMap = computeSimultaneousMap(
    play,
    activeCut?.cutMap ?? {},
    activeCut?.stageDirectionEdits
  );

  // Quick-change warnings
  const quickChangeResult = activeCut
    ? computeQuickChanges(play, activeCut, project.assignments, project.settings)
    : null;

  // For each character: count how many of its simultaneous partners share its assigned actor
  const conflictsPerChar = new Map<string, number>();
  for (const [charId, simSet] of simultaneousMap) {
    const myActor = charToActor[charId];
    if (!myActor) continue;
    let count = 0;
    for (const otherCharId of simSet) {
      if (charToActor[otherCharId] === myActor) count++;
    }
    if (count > 0) conflictsPerChar.set(charId, count);
  }

  // For each character: the set of actor IDs that would cause a doubling conflict
  function getConflictingActorIds(charId: string): Set<string> {
    const simSet = simultaneousMap.get(charId) ?? new Set<string>();
    const conflicting = new Set<string>();
    for (const otherCharId of simSet) {
      const actorId = charToActor[otherCharId];
      if (actorId) conflicting.add(actorId);
    }
    return conflicting;
  }

  // Build a Map<charId, Set<charId>> from the cut's character links
  const linkedCharIdsMap = new Map<string, Set<string>>();
  for (const [a, b] of activeCut?.characterLinks ?? []) {
    if (!linkedCharIdsMap.has(a)) linkedCharIdsMap.set(a, new Set());
    if (!linkedCharIdsMap.has(b)) linkedCharIdsMap.set(b, new Set());
    linkedCharIdsMap.get(a)!.add(b);
    linkedCharIdsMap.get(b)!.add(a);
  }

  // All active (non-fully-cut) characters with resolved display names — for the "Link with…" dropdown
  const allActiveCharsForLinks = speakingChars
    .filter((c) => !fullyCutCharIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: activeCut?.characterAliases?.[c.id] ?? c.name,
    }));

  // #17 Per-actor stats
  const actorStatsMap = new Map<string, { lines: number; words: number; time: number }>();
  for (const actor of project.actors) {
    const charIds = project.assignments.filter((a) => a.actorId === actor.id).map((a) => a.characterId);
    const lines = charIds.reduce((s, id) => s + (lineCounts?.byCharacter[id]?.afterCut ?? 0), 0);
    const words = charIds.reduce((s, id) => s + (lineCounts?.words?.byCharacter[id]?.afterCut ?? 0), 0);
    const time = charIds.reduce((s, id) => s + (stageTime?.byCharacter[id]?.minutes ?? 0), 0);
    actorStatsMap.set(actor.id, { lines, words, time });
  }

  // #18 Sort actors
  // First appearance: earliest unit index among all chars the actor plays
  const actorFirstAppearance = new Map<string, number>();
  {
    let idx = 0;
    for (const act of play.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") {
            const actorId = charToActor[unit.characterId];
            if (actorId && !actorFirstAppearance.has(actorId)) {
              actorFirstAppearance.set(actorId, idx);
            }
          }
          idx++;
        }
      }
    }
  }

  const sortedActors = [...project.actors].sort((a, b) => {
    const sa = actorStatsMap.get(a.id) ?? { lines: 0, words: 0, time: 0 };
    const sb = actorStatsMap.get(b.id) ?? { lines: 0, words: 0, time: 0 };
    const fa = actorFirstAppearance.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const fb = actorFirstAppearance.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    switch (actorSort) {
      case "lines": return sb.lines - sa.lines || a.name.localeCompare(b.name);
      case "words": return sb.words - sa.words || a.name.localeCompare(b.name);
      case "time":  return sb.time - sa.time || a.name.localeCompare(b.name);
      case "first": return fa - fb || a.name.localeCompare(b.name);
      default:      return a.name.localeCompare(b.name);
    }
  });

  // #21 Full cast banner
  const activeNonCutChars = speakingChars.filter((c) => !fullyCutCharIds.has(c.id));
  const isFullyCast =
    activeNonCutChars.length > 0 && activeNonCutChars.every((c) => charToActor[c.id]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-2">Casting</h1>
      <p className="text-stone-500 dark:text-stone-400 text-sm mb-8">
        Assign actors to characters. One actor can play multiple characters (double-casting).
      </p>

      {/* Actor management */}
      <div className="mb-8">
        {/* Section header with sort */}
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
            Actors
          </h2>
          {project.actors.length > 1 && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-stone-400 dark:text-stone-500">
              <span>Sort:</span>
              <select
                value={actorSort}
                onChange={(e) => setActorSort(e.target.value as ActorSort)}
                className="border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="az">A–Z</option>
                <option value="lines">Lines</option>
                <option value="words">Words</option>
                <option value="time">Stage Time</option>
                <option value="first">First Appearance</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Actor name…"
            value={newActorName}
            onChange={(e) => setNewActorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddActor()}
            className="flex-1 border border-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={handleAddActor}
            disabled={!newActorName.trim()}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            Add Actor
          </button>
          <button
            onClick={handleSuggest}
            className="px-4 py-2 text-sm border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            title="Suggest the minimum number of actors needed (greedy doubling algorithm)"
          >
            Suggest
          </button>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className={`px-2 py-2 text-sm rounded-lg border transition-colors ${
              showHelp
                ? "border-stone-400 dark:border-stone-500 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                : "border-stone-200 dark:border-stone-700 text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600"
            }`}
            title="How does Suggest work?"
            aria-pressed={showHelp}
          >
            ?
          </button>
        </div>

        {/* Algorithm help text */}
        {showHelp && (
          <div className="mb-4 rounded-lg border border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 px-4 py-3 text-xs text-stone-500 dark:text-stone-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-stone-600 dark:text-stone-300">How the suggestion works:</strong>{" "}
              Characters are treated as nodes in a graph. Two characters share an edge — and
              therefore <em>cannot</em> be doubled — if they are ever on stage simultaneously,
              or if the gap between one&apos;s exit and the other&apos;s entrance is below the
              quick-change threshold (currently <strong className="text-stone-700 dark:text-stone-200">{threshold} min</strong>).
              The algorithm fills the largest parts first, then clusters smaller parts onto
              actors with the fewest accumulated lines, minimising the total actor count.
            </p>
            <p>
              <strong className="text-stone-600 dark:text-stone-300">Character links</strong> (the{" "}
              <span className="font-mono text-stone-600 dark:text-stone-300">+ link</span> button on each
              character card) let you pin two characters to always share the same actor,
              regardless of quick-change constraints. Use them to encode dramaturgical
              choices — e.g. Theseus/Oberon or Hippolyta/Titania — <em>before</em> running
              Suggest. Links are stored per cut and carried over when you clone a cut.
            </p>

            {/* About doubling */}
            <div className="pt-2 border-t border-stone-200 dark:border-stone-700 space-y-2">
              <p>
                <strong className="text-stone-600 dark:text-stone-300">About doubling.</strong>{" "}
                Scholars distinguish three kinds: <em>deficiency</em> doubling (economic necessity — not
                enough actors), <em>emergency</em> doubling (last-minute substitution), and{" "}
                <em>virtuoso</em> doubling (an artistic choice made to generate theatrical or thematic
                resonance). The Suggest algorithm handles deficiency; you shape the rest.
              </p>
              <p>
                <strong className="text-stone-600 dark:text-stone-300">Thematic pairs.</strong>{" "}
                When one actor plays two characters, audiences carry associations from the first role
                into the second — creating an implicit comparison, contrast, or commentary. Classic
                Shakespeare pairings: Ghost/Claudius (<em>Hamlet</em>), Theseus–Oberon / Hippolyta–Titania
                (<em>A Midsummer Night&apos;s Dream</em>), Cordelia/Fool (<em>King Lear</em>),
                Angelo/Claudio (<em>Measure for Measure</em>). Use Character Links to encode these
                choices before running Suggest.
              </p>
              <p>
                <strong className="text-stone-600 dark:text-stone-300">Practical constraints.</strong>{" "}
                Characters who are ever on stage simultaneously cannot share an actor
                (the Matrix tab shows overlap). Quick-change time — the gap between an exit and a
                re-entrance — is the other hard limit; the tool flags gaps below your threshold.
                Shakespeare designed his plays for 9–12 actors; doubling was built into the
                dramaturgy, not bolted on after the fact.
              </p>
              <p className="text-stone-400 dark:text-stone-500 italic">
                — adapted from Brett Gamboa, <em>Shakespeare&apos;s Double Plays</em> (Cambridge UP, 2018)
              </p>
            </div>
          </div>
        )}

        {/* #16 Replace / Extend choice modal */}
        {suggestState.phase === "choosing" && (
          <div className="mb-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 px-4 py-3">
            <p className="text-sm text-stone-700 dark:text-stone-200 mb-3">
              You already have {project.actors.length} actor{project.actors.length !== 1 ? "s" : ""}.
              What would you like to do?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => runSuggest("replace")}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
              >
                <span className="font-medium">Replace</span>
                <span className="block text-xs opacity-70 font-normal mt-0.5">Clear existing cast and suggest from scratch</span>
              </button>
              <button
                onClick={() => {
                  const unassigned = speakingChars.filter(
                    (c) => !fullyCutCharIds.has(c.id) && !charToActor[c.id]
                  );
                  if (unassigned.length === 0) {
                    setSuggestState({ phase: "idle" });
                    // Briefly show a message — no unassigned chars
                    alert("All characters are already assigned.");
                    return;
                  }
                  runSuggest("extend");
                }}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
              >
                <span className="font-medium">Extend</span>
                <span className="block text-xs opacity-70 font-normal mt-0.5">Add actors only for unassigned characters</span>
              </button>
              <button
                onClick={() => setSuggestState({ phase: "idle" })}
                className="px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Minimum cast suggestion preview */}
        {suggestState.phase === "preview" && (
          <div className="mb-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                {suggestState.mode === "extend" ? "Suggested additions: " : "Suggested minimum: "}
                {suggestState.groups.length} actor{suggestState.groups.length !== 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handleApplySuggestion}
                  className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  Apply
                </button>
                <button
                  onClick={() => setSuggestState({ phase: "idle" })}
                  className="text-xs px-3 py-1.5 border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-lg hover:bg-white dark:hover:bg-stone-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {suggestState.groups.map((g) => {
                const offset = suggestState.mode === "extend" ? project.actors.length : 0;
                return (
                  <div key={g.actorIndex} className="flex items-start gap-2 text-xs">
                    <span
                      className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                      style={{ backgroundColor: defaultColors[(offset + g.actorIndex) % defaultColors.length] }}
                    />
                    <span className="text-stone-500 dark:text-stone-400 shrink-0">Actor {offset + g.actorIndex + 1}:</span>
                    <span className="text-stone-700 dark:text-stone-200">
                      {[
                        ...new Set(
                          g.charIds.map(
                            (id) =>
                              activeCut?.characterAliases?.[id] ??
                              speakingChars.find((c) => c.id === id)?.name ??
                              characterIdToName(id)
                          )
                        ),
                      ].join(", ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actor chips */}
        {sortedActors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedActors.map((actor) => {
              const isEditing = editingActorId === actor.id;
              const isConfirmingDelete = confirmDeleteActorId === actor.id;
              const assignedCharIds = project.assignments
                .filter((a) => a.actorId === actor.id)
                .map((a) => a.characterId);
              const assignedCount = assignedCharIds.length;
              const stats = actorStatsMap.get(actor.id) ?? { lines: 0, words: 0, time: 0 };
              const isLowTime = stats.time > 0 && stats.time < minActorStageTime;

              // Resolve display names for assigned characters (deduplicated)
              const assignedCharNames = [
                ...new Set(
                  assignedCharIds.map(
                    (id) =>
                      activeCut?.characterAliases?.[id] ??
                      play?.castList.find((c) => c.id === id)?.name ??
                      characterIdToName(id)
                  )
                ),
              ];

              if (isConfirmingDelete) {
                return (
                  <div
                    key={actor.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-sm"
                  >
                    <span className="text-red-700 dark:text-red-300 text-xs">
                      Remove {actor.name}
                      {assignedCount > 0 ? ` (${assignedCount} assigned char${assignedCount > 1 ? "s" : ""})` : ""}?
                    </span>
                    <button
                      onClick={() => {
                        dispatch({ type: "DELETE_ACTOR", actorId: actor.id });
                        setConfirmDeleteActorId(null);
                      }}
                      className="text-xs text-red-600 dark:text-red-400 font-medium hover:text-red-800 dark:hover:text-red-300"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteActorId(null)}
                      className="text-xs text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-400"
                    >
                      Cancel
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={actor.id}
                  className={`group/chip flex items-start gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-sm ${
                    isLowTime
                      ? "border-amber-300 dark:border-amber-700 border-l-2"
                      : "border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <label
                    className="w-3 h-3 rounded-full cursor-pointer shrink-0 mt-0.5 hover:ring-2 hover:ring-offset-1 hover:ring-stone-400 transition-shadow"
                    style={{ backgroundColor: actor.color }}
                    title="Click to change color"
                  >
                    <input
                      type="color"
                      value={actor.color}
                      onChange={(e) =>
                        dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: actor.name, color: e.target.value })
                      }
                      className="sr-only"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingActorName}
                          onChange={(e) => setEditingActorName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingActorName.trim()) {
                              dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: editingActorName.trim(), color: actor.color });
                              setEditingActorId(null);
                            } else if (e.key === "Escape") {
                              setEditingActorId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingActorName.trim()) {
                              dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: editingActorName.trim(), color: actor.color });
                            }
                            setEditingActorId(null);
                          }}
                          className="text-stone-700 dark:text-stone-200 bg-transparent border-b border-stone-400 dark:border-stone-500 focus:outline-none focus:border-amber-500 w-24 text-sm"
                        />
                      ) : (
                        <span
                          className="group/name flex items-center gap-1 cursor-text"
                          title="Click to rename"
                          onClick={() => {
                            setEditingActorId(actor.id);
                            setEditingActorName(actor.name);
                          }}
                        >
                          <span className="text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100">{actor.name}</span>
                          <span className="text-stone-300 dark:text-stone-600 opacity-0 group-hover/name:opacity-100 transition-opacity text-xs select-none" aria-hidden>✎</span>
                        </span>
                      )}
                      {isLowTime && (
                        <span className="text-amber-500 text-xs ml-0.5" title={`Stage time below ${minActorStageTime} min threshold`}>⚠</span>
                      )}
                      <button
                        onClick={() => {
                          if (assignedCount > 0) {
                            setConfirmDeleteActorId(actor.id);
                          } else {
                            dispatch({ type: "DELETE_ACTOR", actorId: actor.id });
                          }
                        }}
                        className="text-stone-300 dark:text-stone-600 hover:text-red-400 dark:hover:text-red-500 ml-1 text-xs"
                        title="Remove actor"
                      >
                        ✕
                      </button>
                    </div>
                    {assignedCharNames.length > 0 && (
                      <div className="text-xs text-stone-400 dark:text-stone-400 mt-0.5 leading-snug">
                        {assignedCharNames.join(", ")}
                      </div>
                    )}
                    {/* #17 Actor stats */}
                    {assignedCount > 0 && (stats.lines > 0 || stats.words > 0 || stats.time > 0) && (
                      <div className={`text-xs mt-0.5 tabular-nums ${isLowTime ? "text-amber-600 dark:text-amber-400" : "text-stone-400 dark:text-stone-500"}`}>
                        {stats.lines > 0 && `${stats.lines.toLocaleString()} lines`}
                        {stats.lines > 0 && stats.words > 0 && " · "}
                        {stats.words > 0 && `${stats.words.toLocaleString()} words`}
                        {(stats.lines > 0 || stats.words > 0) && stats.time > 0 && " · "}
                        {stats.time > 0 && `${Math.round(stats.time)} min`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick-change warnings */}
      {quickChangeResult && (
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-3">
            <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Quick-change Warnings
            </h2>
            <div className="text-xs text-stone-400 dark:text-stone-500 ml-auto">
              Threshold: {threshold} min <span className="text-stone-300 dark:text-stone-600">(change in Settings ⚙)</span>
            </div>
          </div>

          {quickChangeResult.warnings.length === 0 ? (
            <p className="text-sm text-stone-400 dark:text-stone-400">
              No quick changes detected below {threshold} min.
            </p>
          ) : (
            <div className="space-y-2">
              {quickChangeResult.warnings.map((w, i) => {
                const actor = project.actors.find((a) => a.id === w.actorId);
                const exitChar = play.castList.find((c) => c.id === w.exitCharacterId);
                const enterChar = play.castList.find((c) => c.id === w.enterCharacterId);
                const exitName =
                  activeCut?.characterAliases?.[w.exitCharacterId] ??
                  exitChar?.name ??
                  characterIdToName(w.exitCharacterId);
                const enterName =
                  activeCut?.characterAliases?.[w.enterCharacterId] ??
                  enterChar?.name ??
                  characterIdToName(w.enterCharacterId);
                const mins = Math.floor(w.gapMinutes);
                const secs = Math.round((w.gapMinutes - mins) * 60);
                const gapLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                // Format location: "Act 1, scene 2: ~l.47"
                const exitLoc = `Act ${w.exitActNum}, scene ${w.exitSceneNum}: ~l.${w.exitApproxLine}`;
                const enterLoc = `Act ${w.enterActNum}, scene ${w.enterSceneNum}: ~l.${w.enterApproxLine}`;

                return (
                  <div
                    key={i}
                    className="px-4 py-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-sm"
                  >
                    {/* Row 1: actor · characters · gap */}
                    <div className="flex items-center gap-3">
                      <span className="text-amber-500 shrink-0">⚡</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {actor && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: actor.color }}
                          />
                        )}
                        <span className="font-medium text-stone-700 dark:text-stone-200 shrink-0">
                          {actor?.name ?? w.actorId}
                        </span>
                      </div>
                      <span className="text-stone-500 dark:text-stone-400 truncate min-w-0">
                        {exitName} → {enterName}
                      </span>
                      <span className="ml-auto shrink-0 font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                        {gapLabel} gap
                      </span>
                    </div>
                    {/* Row 2: act / scene / original line location */}
                    <div className="mt-1 ml-6 text-xs text-stone-400 dark:text-stone-400 tabular-nums">
                      {exitLoc} → {enterLoc}
                      <span className="ml-1.5 text-stone-300 dark:text-stone-600">(original lines)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* #21 Full cast banner */}
      {isFullyCast && !fullCastBannerDismissed && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-sm">
          <span className="text-green-600 dark:text-green-400 shrink-0">✓</span>
          <span className="text-green-800 dark:text-green-300 flex-1">
            All characters cast.{" "}
            <Link
              href={`/projects/${projectId}/dashboard?tab=rehearsal`}
              className="underline decoration-dotted hover:text-green-900 dark:hover:text-green-200"
            >
              Check the Rehearsal tab →
            </Link>{" "}
            for suggested rehearsal blocks.
          </span>
          <button
            onClick={() => setFullCastBannerDismissed(true)}
            className="text-green-500 dark:text-green-500 hover:text-green-700 dark:hover:text-green-300 text-lg leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Character assignments */}
      <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
        Characters
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {speakingChars.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            assignedActorId={charToActor[char.id] || null}
            actors={project.actors}
            onAssign={(actorId) =>
              dispatch({ type: "ASSIGN_CHARACTER", characterId: char.id, actorId })
            }
            conflictCount={conflictsPerChar.get(char.id) ?? 0}
            conflictingActorIds={getConflictingActorIds(char.id)}
            isFullyCut={fullyCutCharIds.has(char.id)}
            lineCounts={lineCounts?.byCharacter[char.id] ?? { original: 0, afterCut: 0 }}
            wordCounts={lineCounts?.words.byCharacter[char.id] ?? { original: 0, afterCut: 0 }}
            stageMinutes={stageTime?.byCharacter[char.id]?.minutes}
            alias={activeCut?.characterAliases?.[char.id]}
            onSetAlias={(alias) =>
              dispatch({ type: "SET_CHARACTER_ALIAS", characterId: char.id, alias })
            }
            linkedCharIds={linkedCharIdsMap.get(char.id)}
            allActiveChars={allActiveCharsForLinks}
            onToggleLink={(otherId) =>
              dispatch({ type: "TOGGLE_CHARACTER_LINK", charIdA: char.id, charIdB: otherId })
            }
          />
        ))}
      </div>
    </div>
  );
}
