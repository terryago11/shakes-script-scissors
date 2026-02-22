import type { Play, Speech, StageDirection } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { CueScript, CueEntry } from "@/types/cut";
import { getAllUnitsInOrder } from "./CutEngine";

/**
 * Build a cue script for a single actor from a cut play.
 *
 * Format:
 *   - Cue: last 2–3 words from the preceding speech (right-aligned, italicized in UI)
 *   - Lines: the actor's own lines (full text)
 *   - Stage: stage directions that mention the actor's characters
 *
 * Speeches marked as "cut" in the cutMap are excluded.
 */
export function buildCueScript(
  play: Play,
  cut: Cut,
  actor: Actor,
  assignments: ActorAssignment[]
): CueScript {
  // Get all character IDs this actor plays
  const actorCharIds = new Set(
    assignments.filter((a) => a.actorId === actor.id).map((a) => a.characterId)
  );

  const allUnits = getAllUnitsInOrder(play);
  const entries: CueEntry[] = [];

  let lastOtherSpeechText: string | null = null;
  let pendingCue: string | null = null;
  let inActorBlock = false;

  for (const unit of allUnits) {
    // Skip cut units
    if (cut.cutMap[unit.id] === "cut") continue;

    if (unit.type === "speech") {
      const speech = unit as Speech;
      const isActorSpeech = actorCharIds.has(speech.characterId);

      if (isActorSpeech) {
        // If we have a pending cue from the previous speaker, emit it
        if (pendingCue !== null) {
          entries.push({ type: "cue", text: pendingCue });
          pendingCue = null;
        } else if (!inActorBlock && lastOtherSpeechText !== null) {
          // First speech — extract cue from the last other speech we saw
          entries.push({ type: "cue", text: extractCue(lastOtherSpeechText) });
        }

        // Emit the actor's lines
        const linesText = speech.lines.map((l) => l.text).join("\n");
        entries.push({ type: "lines", text: linesText });
        inActorBlock = true;
        lastOtherSpeechText = null;
      } else {
        // Someone else is speaking
        const fullText = speech.lines.map((l) => l.text).join(" ");
        if (inActorBlock) {
          // We just finished an actor block — prep the cue from this speech
          pendingCue = extractCue(fullText);
          inActorBlock = false;
        }
        lastOtherSpeechText = fullText;
      }
    } else if (unit.type === "stage") {
      const stage = unit as StageDirection;
      // Include stage directions that mention any of the actor's characters
      const relevant = stage.characters.some((c) => actorCharIds.has(c));
      if (relevant) {
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
