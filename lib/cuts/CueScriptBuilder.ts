import type { Play, Speech, StageDirection } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { CueScript, CueEntry } from "@/types/cut";
import { getEffectiveUnitsInOrder } from "./CutEngine";
import { getEffectiveCharacters } from "./StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { applyEditsToLine, segmentsToText } from "./applyEdits";

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

  const allUnits = getEffectiveUnitsInOrder(play, cut);
  const entries: CueEntry[] = [];

  let lastOtherSpeechText: string | null = null;
  let lastOtherSpeakerName: string | null = null;
  let pendingCue: string | null = null;
  let pendingCueSpeakerName: string | null = null;
  let inActorBlock = false;

  for (const unit of allUnits) {
    // Skip cut units
    if (cut.cutMap[unit.id] === "cut") continue;

    if (unit.type === "speech") {
      const speech = unit as Speech;
      const isActorSpeech = actorCharIds.has(speech.characterId);

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
        // Treat as if the speech doesn't exist for cue purposes
        continue;
      }

      if (isActorSpeech) {
        // If we have a pending cue from the previous speaker, emit it
        if (pendingCue !== null) {
          entries.push({ type: "cue", text: pendingCue, cueSpeakerName: pendingCueSpeakerName ?? undefined });
          pendingCue = null;
          pendingCueSpeakerName = null;
        } else if (!inActorBlock && lastOtherSpeechText !== null) {
          // First speech — extract cue from the last other speech we saw
          entries.push({ type: "cue", text: extractCue(lastOtherSpeechText), cueSpeakerName: lastOtherSpeakerName ?? undefined });
        }

        // Emit the actor's kept lines only
        const linesText = keptLines.map((l) => l.text).join("\n");
        if (linesText) {
          entries.push({ type: "lines", text: linesText, characterName: resolveCharacterName(speech.characterId, characterAliases, play.castList) });
        }
        inActorBlock = true;
        lastOtherSpeechText = null;
        lastOtherSpeakerName = null;
      } else {
        // Someone else is speaking — use only kept lines for cue text
        const fullText = keptLines.map((l) => l.text).join(" ");
        if (inActorBlock) {
          // We just finished an actor block — prep the cue from this speech
          pendingCue = extractCue(fullText);
          pendingCueSpeakerName = resolveCharacterName(speech.characterId, characterAliases, play.castList);
          inActorBlock = false;
        }
        lastOtherSpeechText = fullText;
        lastOtherSpeakerName = resolveCharacterName(speech.characterId, characterAliases, play.castList);
      }
    } else if (unit.type === "stage") {
      const stage = unit as StageDirection;
      // Use effective characters (respects stageDirectionEdits) to check relevance
      const effectiveChars = getEffectiveCharacters(stage, stageDirectionEdits);
      const relevant = effectiveChars.some((c) => actorCharIds.has(c));
      if (relevant) {
        // For entrance and exit SDs, emit a cue first so the actor knows when to enter/exit
        if (stage.stageType === "entrance" || stage.stageType === "exit") {
          if (pendingCue !== null) {
            entries.push({ type: "cue", text: pendingCue, cueSpeakerName: pendingCueSpeakerName ?? undefined });
            pendingCue = null;
            pendingCueSpeakerName = null;
          } else if (lastOtherSpeechText !== null) {
            entries.push({ type: "cue", text: extractCue(lastOtherSpeechText), cueSpeakerName: lastOtherSpeakerName ?? undefined });
          }
          if (stage.stageType === "entrance") {
            inActorBlock = true;
          } else {
            // exit: actor leaves stage
            inActorBlock = false;
          }
        }
        entries.push({ type: "stage", text: stage.text });
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
  // Remove stage directions in brackets
  const cleaned = text.replace(/\[[^\]]*\]/g, "").trim();

  // Split into words, filter empties
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  if (words.length === 0) return "...";

  // Take last 3 words (or fewer if the speech is short)
  const cueWords = words.slice(-3);
  return cueWords.join(" ");
}
