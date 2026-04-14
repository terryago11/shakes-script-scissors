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
import { expandSplits, expandInsertions, expandStageNotes } from "@/lib/cuts/expandUtils";
import { applyEditsToLine, segmentsToText } from "@/lib/cuts/applyEdits";

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

      // Expand stageNotes, splits, and insertions for this scene
      const sceneUnits = expandStageNotes(
        expandInsertions(
          expandSplits(scene.units, cut.speechSplits),
          cut.insertions,
          play.castList
        )
      );

      for (const unit of sceneUnits) {
        const effectivelyCut = isUnitCut(unit.id, cut);

        // In clean mode, skip cut units entirely
        if (effectivelyCut && viewMode === "clean") continue;

        if (unit.type === "speech") {
          const speech = unit as Speech;
          const label = resolveSpeakerLabel(speech, cut);
          const delivery = speech.deliveryNote ? ` ${speech.deliveryNote}` : "";
          const fullLabel = (label + delivery).toUpperCase();

          // Speaker label paragraph
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: fullLabel,
                  bold: true,
                  size: 18,
                  ...(effectivelyCut ? { strike: true, color: "999999" } : {}),
                }),
              ],
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
            const text = lineOps.length > 0
              ? segmentsToText(applyEditsToLine(line.id, line.text, lineOps))
              : line.text;

            if (!text.trim()) continue;

            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text,
                    size: 22,
                    ...((effectivelyCut || lineCut) ? { strike: true, color: "999999" } : {}),
                  }),
                ],
                spacing: { before: 0, after: 0 },
              })
            );
          }
        } else if (unit.type === "stage") {
          const stage = unit as StageDirection;
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${stage.text}]`,
                  italics: true,
                  color: effectivelyCut ? "aaaaaa" : "666666",
                  size: 18,
                  ...(effectivelyCut ? { strike: true } : {}),
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 22 } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
