/**
 * Server-only: renders a full play script (one cut) to a DOCX Buffer using the docx package.
 * Supports "clean" mode (cut units hidden) and "standard" mode (cut units shown with strikethrough).
 * Do NOT import this from client components.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";
import type { Play, Speech, StageDirection } from "@/types/play";
import type { Cut } from "@/types/project";
import { expandSplits, expandInsertions, expandStageNotes, expandInsertedSDs } from "@/lib/cuts/expandUtils";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import { PART_LABELS } from "@/lib/cuts/SceneSubdivisionUtils";

export type ScriptDocxViewMode = "clean" | "standard";

/** Resolve the effective display name for a speech, respecting reassignments and aliases. */
function resolveSpeakerLabel(speech: Speech, cut: Cut): string {
  const aliases = cut.characterAliases ?? {};
  const reassigned = cut.speechReassignments?.[speech.id];
  const effectiveCharIds: string[] = reassigned ?? speech.characterIds ?? [speech.characterId];

  if (!reassigned && /\bALL\b/i.test(speech.speakerTag)) {
    return speech.speakerTag.trim();
  }

  // Try to resolve name from aliases or fall back to characterName
  return effectiveCharIds
    .map((id) => aliases[id] ?? speech.characterName ?? id)
    .join(" & ");
}

/** Is this unit effectively cut (including stageNote continuation inheritance)? */
function isUnitCut(unitId: string, cut: Cut): boolean {
  if (cut.cutMap[unitId] === "cut") return true;
  const snBase = unitId.match(/^(.+):sn\d+$/)?.[1];
  return snBase ? cut.cutMap[snBase] === "cut" : false;
}

export async function renderScriptDocx(
  play: Play,
  cut: Cut,
  viewMode: ScriptDocxViewMode
): Promise<Buffer> {
  const lineCutMap = cut.lineCutMap ?? {};
  const speechEdits = cut.speechEdits ?? {};

  const paragraphs: Paragraph[] = [];

  // ── Title block ─────────────────────────────────────────────────────────────
  paragraphs.push(
    new Paragraph({
      text: play.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Cut: ${cut.name}`, color: "888888", size: 20 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 6 },
      },
      text: "",
      spacing: { after: 160 },
    })
  );

  // ── Character list ───────────────────────────────────────────────────────────
  {
    const allSpeeches = play.acts
      .flatMap((a) => a.scenes.flatMap((s) => s.units))
      .filter((u): u is Speech => u.type === "speech");

    const speechesByChar = new Map<string, string[]>();
    for (const speech of allSpeeches) {
      const charIds: string[] = speech.characterIds ?? [speech.characterId];
      for (const charId of charIds) {
        const arr = speechesByChar.get(charId) ?? [];
        arr.push(speech.id);
        speechesByChar.set(charId, arr);
      }
    }

    const aliases = cut.characterAliases ?? {};

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "Characters", bold: true, size: 24 })],
        spacing: { before: 200, after: 100 },
      })
    );

    for (const char of play.castList) {
      const speechIds = speechesByChar.get(char.id) ?? [];
      const fullyCut = speechIds.length > 0 && speechIds.every((id) => cut.cutMap[id] === "cut");
      const alias = aliases[char.id];
      const runs: TextRun[] = [];

      if (fullyCut) {
        runs.push(new TextRun({ text: char.name, size: 24, color: "aaaaaa", strike: true }));
      } else if (alias) {
        runs.push(new TextRun({ text: alias, size: 24, color: "1d6b38" }));
        runs.push(new TextRun({ text: ` (${char.name})`, size: 24, color: "888888" }));
      } else {
        runs.push(new TextRun({ text: char.name, size: 24 }));
      }

      paragraphs.push(
        new Paragraph({ children: runs, spacing: { before: 0, after: 40 } })
      );
    }

    paragraphs.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 6 } },
        text: "",
        spacing: { after: 160 },
      })
    );
  }

  // ── Walk acts → scenes → expanded units ─────────────────────────────────────
  let isFirstAct = true;

  for (const act of play.acts) {
    // Act heading — page break before every act except the first
    paragraphs.push(
      new Paragraph({
        text: act.title,
        heading: HeadingLevel.HEADING_1,
        ...(!isFirstAct ? { pageBreakBefore: true } : {}),
      })
    );
    isFirstAct = false;

    for (const scene of act.scenes) {
      // Scene heading
      paragraphs.push(
        new Paragraph({
          text: scene.title,
          heading: HeadingLevel.HEADING_2,
        })
      );

      // Expand stageNotes, splits, insertions, and inserted SDs for this scene
      const sceneUnits = expandInsertedSDs(
        expandStageNotes(
          expandInsertions(
            expandSplits(scene.units, cut.speechSplits),
            cut.insertions,
            play.castList
          )
        ),
        cut.insertedSDs
      );

      // Sub-scene division tracking
      const sceneSplits = cut.sceneSubdivisions?.[scene.id] ?? [];
      const splitBoundaryIds = new Set(sceneSplits.map((s) => s.afterUnitId));
      let splitIdx = 0;

      for (const unit of sceneUnits) {
        const effectivelyCut = isUnitCut(unit.id, cut);

        // In clean mode, skip cut units entirely
        if (effectivelyCut && viewMode === "clean") continue;

        if (unit.type === "speech") {
          const speech = unit as Speech;
          const reassignment = cut.speechReassignments?.[speech.id];
          const isInsertion = !!(cut.insertions?.[speech.id]);
          const effectiveDeliveryNote =
            cut.deliveryNoteEdits?.[speech.id] !== undefined
              ? cut.deliveryNoteEdits[speech.id] || undefined
              : speech.deliveryNote;

          // Speaker label: in standard mode show original struck-out + new name for reassignments
          const labelRuns: TextRun[] = [];
          if (reassignment && viewMode === "standard") {
            // Original name struck through
            labelRuns.push(new TextRun({
              text: (speech.characterName ?? speech.characterId).toUpperCase() + " ",
              bold: true, size: 18, strike: true, color: "999999",
            }));
            // New name in green
            const newName = resolveSpeakerLabel(speech, cut);
            labelRuns.push(new TextRun({
              text: newName.toUpperCase(),
              bold: true, size: 18, color: "1d6b38",
            }));
            if (effectiveDeliveryNote) {
              labelRuns.push(new TextRun({
                text: ` ${effectiveDeliveryNote}`,
                italics: true, bold: false, size: 18, color: "1d6b38",
              }));
            }
          } else {
            const label = resolveSpeakerLabel(speech, cut);
            labelRuns.push(new TextRun({
              text: label.toUpperCase(),
              bold: true, size: 18,
              ...(effectivelyCut ? { strike: true, color: "999999" } : {}),
              ...(isInsertion ? { color: "1d6b38" } : {}),
            }));
            if (effectiveDeliveryNote) {
              labelRuns.push(new TextRun({
                text: ` ${effectiveDeliveryNote}`,
                italics: true, bold: false, size: 18,
                ...(effectivelyCut ? { strike: true, color: "999999" } : {}),
                ...(isInsertion ? { color: "1d6b38" } : {}),
              }));
            }
          }

          paragraphs.push(
            new Paragraph({
              children: labelRuns,
              spacing: { before: 160, after: 0 },
            })
          );

          // Lines — apply word-level edits and filter line cuts
          const edit = speechEdits[speech.id];
          const ops = edit?.ops ?? [];

          for (const line of speech.lines) {
            const lineCut = lineCutMap[line.id] === "cut";
            if (lineCut && viewMode === "clean") continue;

            const lineOps = ops.filter((op) => op.lineId === line.id);
            const baseStrike = effectivelyCut || lineCut;

            let runs: TextRun[];

            if (lineOps.length > 0 && viewMode === "standard") {
              // Render each edit segment with its own formatting
              const segments = applyEditsToLine(line.id, line.text, lineOps);
              runs = segments
                .filter((s) => s.type !== "cut" || viewMode === "standard")
                .map((s) => {
                  if (s.type === "cut") {
                    return new TextRun({ text: s.text, size: 24, strike: true, color: "999999" });
                  } else if (s.type === "insert") {
                    // Inserted words: underlined to distinguish from original text
                    return new TextRun({ text: s.text, size: 24, underline: {}, color: "1d6b38" });
                  } else {
                    return new TextRun({
                      text: s.text, size: 24,
                      ...(baseStrike ? { strike: true, color: "999999" } : {}),
                    });
                  }
                });
            } else if (lineOps.length > 0 && viewMode === "clean") {
              // Clean mode: collapse segments, skipping cuts
              const segments = applyEditsToLine(line.id, line.text, lineOps);
              const text = segments
                .filter((s) => s.type !== "cut")
                .map((s) => s.text)
                .join("");
              if (!text.trim()) continue;
              runs = [new TextRun({ text, size: 24 })];
            } else {
              if (!line.text.trim()) continue;
              runs = [new TextRun({
                text: line.text,
                size: 24,
                ...(baseStrike ? { strike: true, color: "999999" } : {}),
                // Highlight inserted speeches (from cut.insertions) in green
                ...(isInsertion ? { color: "1d6b38" } : {}),
              })];
            }

            if (runs.length === 0) continue;

            paragraphs.push(
              new Paragraph({
                children: runs,
                spacing: { before: 0, after: 0 },
              })
            );
          }
        } else if (unit.type === "stage") {
          const stage = unit as StageDirection;
          const isInsertedSD = !!(cut.insertedSDs?.[stage.id]);
          const isTextEditedSD = !!(cut.sdTextEdits?.[stage.id]);
          const isSyntheticSD = stage.id.endsWith(":sd"); // from expandStageNotes
          const sdText = cut.sdTextEdits?.[stage.id] ?? stage.text;
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${sdText}]`,
                  italics: true,
                  size: 18,
                  ...(effectivelyCut
                    ? { strike: true, color: "aaaaaa" }
                    : ((isInsertedSD || isTextEditedSD) && viewMode === "standard")
                    ? { color: "1d6b38" }  // inserted/edited SDs in green in standard mode
                    : isSyntheticSD
                    ? { color: "666666" }  // stageNote-expanded SDs in muted grey
                    : { color: "666666" }),
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
            })
          );
        }

        // Inject sub-scene divider after a split boundary
        if (splitBoundaryIds.has(unit.id)) {
          const nextLabel = PART_LABELS[splitIdx + 1] ?? String(splitIdx + 2);
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: `— Part ${nextLabel} —`, bold: true, size: 20 })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 200 },
            })
          );
          splitIdx++;
        }
      }
    }
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 24 } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
