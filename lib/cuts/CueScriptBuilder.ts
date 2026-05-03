import type { Play, Act, Scene, Speech, StageDirection } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { CueScript, CueEntry } from "@/types/cut";
import { getEffectiveSceneOrder } from "@/lib/project/projectUtils";
import { getEffectiveCharacters } from "./StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { applyEditsToLine, segmentsToText } from "./applyEdits";
import { expandSplits, expandInsertions, expandInsertedSDs, expandStageNotes } from "./expandUtils";

/**
 * Build a cue script for a single actor from a cut play.
 *
 * Format:
 *   - Cue: last 2–3 words from the preceding speech (right-aligned, italicized in UI)
 *   - Lines: the actor's own lines (full text)
 *   - Stage: stage directions that mention the actor's characters
 *
 * Speeches marked as "cut" in the cutMap are excluded.
 * Stage directions use effective characters (respects stageDirectionEdits).
 * Entrance and exit SDs include a cue entry showing what was being said when the actor enters/exits.
 * Each entry carries scene/act metadata for the line buddy scene-based layout.
 */
export function buildCueScript(
  play: Play,
  cut: Cut,
  actor: Actor,
  assignments: ActorAssignment[],
  characterAliases?: Record<string, string>
): CueScript {
  // Get all character IDs this actor plays
  const actorCharIds = new Set(
    assignments.filter((a) => a.actorId === actor.id).map((a) => a.characterId)
  );
  const lineCutMap = cut.lineCutMap ?? {};
  const speechEdits = cut.speechEdits ?? {};
  const stageDirectionEdits = cut.stageDirectionEdits ?? {};

  // Build scene ID → { act, scene } map for ordered traversal
  const sceneMap = new Map<string, { act: Act; scene: Scene }>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, { act, scene });
    }
  }

  const effectiveSceneIds = getEffectiveSceneOrder(play, cut);
  const entries: CueEntry[] = [];

  let lastOtherSpeechText: string | null = null;
  let lastOtherSpeakerName: string | null = null;
  let pendingCue: string | null = null;
  let pendingCueSpeakerName: string | null = null;
  let inActorBlock = false;

  for (const sceneId of effectiveSceneIds) {
    const sceneEntry = sceneMap.get(sceneId);
    if (!sceneEntry) continue;
    const { act, scene } = sceneEntry;

    const allUnits = expandStageNotes(expandInsertedSDs(
      expandInsertions(
        expandSplits(scene.units, cut.speechSplits),
        cut.insertions,
        play.castList
      ),
      cut.insertedSDs
    ));

    const sceneCtx = { sceneId: scene.id, actId: act.id, sceneTitle: scene.title, actTitle: act.title };

    for (const unit of allUnits) {
      // Skip cut units
      if (cut.cutMap[unit.id] === "cut") continue;

      if (unit.type === "speech") {
        const speech = unit as Speech;
        // Respect speechReassignments (string[]); fall back to speech.characterIds or single characterId
        const effectiveCharIds: string[] = cut.speechReassignments?.[speech.id]
          ?? speech.characterIds
          ?? [speech.characterId];
        const isActorSpeech = effectiveCharIds.some((id) => actorCharIds.has(id));
        // Primary effective char used for display name when listing "who is speaking"
        const primaryEffectiveCharId = effectiveCharIds[0] ?? speech.characterId;

        // Filter lines by lineCutMap and apply word-level edits
        const edit = speechEdits[speech.id];
        const ops = edit?.ops ?? [];
        const keptLines = speech.lines
          .filter((l) => lineCutMap[l.id] !== "cut")
          .map((l) => {
            const lineOps = ops.filter((op) => op.lineId === l.id);
            if (lineOps.length === 0) return { ...l };
            const segments = applyEditsToLine(l.id, l.text, lineOps);
            return { ...l, text: segmentsToText(segments) };
          })
          .filter((l) => l.text.trim().length > 0);
        if (keptLines.length === 0 && !isActorSpeech) {
          continue;
        }

        // Build the speaker label for this speech
        const isAllSpeech = /\bALL\b/i.test(speech.speakerTag) && !cut.speechReassignments?.[speech.id];
        const speakerLabel = isAllSpeech
          ? speech.speakerTag.trim()
          : effectiveCharIds
              .map((id) => resolveCharacterName(id, characterAliases, play.castList))
              .join(" & ");

        if (isActorSpeech) {
          // Emit pending cue before actor's lines
          if (pendingCue !== null) {
            entries.push({ type: "cue", text: pendingCue, cueSpeakerName: pendingCueSpeakerName ?? undefined, ...sceneCtx });
            pendingCue = null;
            pendingCueSpeakerName = null;
          } else if (!inActorBlock && lastOtherSpeechText !== null) {
            entries.push({ type: "cue", text: extractCue(lastOtherSpeechText), cueSpeakerName: lastOtherSpeakerName ?? undefined, ...sceneCtx });
          }

          const linesText = keptLines.map((l) => l.text).join("\n");
          const effectiveDeliveryNote =
            cut.deliveryNoteEdits?.[speech.id] !== undefined
              ? cut.deliveryNoteEdits[speech.id] || undefined
              : speech.deliveryNote;
          const label = effectiveDeliveryNote ? `${speakerLabel} ${effectiveDeliveryNote}` : speakerLabel;
          const isSongSpeech = speech.isSong || cut.sdFlagOverrides?.[speech.id]?.isSong;
          if (linesText) {
            entries.push({ type: "lines", text: linesText, characterName: label, isSong: isSongSpeech || undefined, ...sceneCtx });
          }
          inActorBlock = true;
          lastOtherSpeechText = null;
          lastOtherSpeakerName = null;
        } else {
          const fullText = keptLines.map((l) => l.text).join(" ");
          if (inActorBlock) {
            pendingCue = extractCue(fullText);
            pendingCueSpeakerName = resolveCharacterName(primaryEffectiveCharId, characterAliases, play.castList);
            inActorBlock = false;
          }
          lastOtherSpeechText = fullText;
          lastOtherSpeakerName = resolveCharacterName(primaryEffectiveCharId, characterAliases, play.castList);
        }
      } else if (unit.type === "stage") {
        const stage = unit as StageDirection;
        const effectiveChars = getEffectiveCharacters(stage, stageDirectionEdits);
        const relevant = effectiveChars.some((c) => actorCharIds.has(c));
        const isSongSD = (cut.sdFlagOverrides?.[stage.id]?.isSong ?? stage.isSong) === true;
        const isDanceSD = (cut.sdFlagOverrides?.[stage.id]?.isDance ?? stage.isDance) === true;
        if (relevant) {
          if (stage.stageType === "entrance" || stage.stageType === "exit") {
            if (pendingCue !== null) {
              entries.push({ type: "cue", text: pendingCue, cueSpeakerName: pendingCueSpeakerName ?? undefined, ...sceneCtx });
              pendingCue = null;
              pendingCueSpeakerName = null;
            } else if (lastOtherSpeechText !== null) {
              entries.push({ type: "cue", text: extractCue(lastOtherSpeechText), cueSpeakerName: lastOtherSpeakerName ?? undefined, ...sceneCtx });
            }
            if (stage.stageType === "entrance") {
              inActorBlock = true;
            } else {
              inActorBlock = false;
            }
          }
          entries.push({ type: "stage", text: cut.sdTextEdits?.[stage.id] ?? stage.text, isSong: isSongSD || undefined, isDance: isDanceSD || undefined, ...sceneCtx });
        } else if (inActorBlock && stage.stageType !== "entrance" && stage.stageType !== "exit") {
          entries.push({ type: "stage", text: cut.sdTextEdits?.[stage.id] ?? stage.text, isSong: isSongSD || undefined, isDance: isDanceSD || undefined, ...sceneCtx });
        }
      }
    }
  }

  return {
    actorId: actor.id,
    actorName: actor.name,
    playTitle: play.title,
    cutName: cut.name,
    entries,
  };
}

/**
 * Extract the last 2–3 meaningful words from a speech as a cue.
 * Strips stage directions in brackets and punctuation-only endings.
 */
function extractCue(text: string): string {
  const cleaned = text.replace(/\[[^\]]*\]/g, "").trim();
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return "...";
  return words.slice(-3).join(" ");
}
