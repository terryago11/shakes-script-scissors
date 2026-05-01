/**
 * Server-only: renders a casting grid to a PDF Buffer using pdfkit.
 * Do NOT import this from client components.
 */
import PDFDocument from "pdfkit";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { sanitizeName, pdfToBuffer } from "@/lib/export/cueScriptPdf";

const M_TOP = 48;
const M_BOTTOM = 48;
const M_LEFT = 36;
const M_RIGHT = 36;
const PDF_MARGIN = 16;

const COLS = 3;
const GAP = 8;

function fmtMins(m: number): string {
  if (m <= 0) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function buildCastingGridFileName(projectName: string): string {
  return `${sanitizeName(projectName)}_casting_sheet.pdf`;
}

export async function exportCastingGridPdf(params: {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
  lineCounts: LineCounts;
  stageTime: StageTimeResult | null;
  characterLinks: Array<[string, string]>;
  projectName?: string;
  optionName?: string;
}): Promise<Buffer> {
  const { play, cut, actors, assignments, lineCounts, stageTime, characterLinks, projectName, optionName } = params;

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: PDF_MARGIN, bottom: PDF_MARGIN, left: M_LEFT, right: M_RIGHT },
    info: {
      Title: `${projectName ?? play.title} — Casting Sheet`,
      Author: "Shakespeare Script Scissors",
    },
    autoFirstPage: true,
    bufferPages: false,
  });

  const pageW = doc.page.width;
  const contentW = pageW - M_LEFT - M_RIGHT;
  const cardW = (contentW - GAP * (COLS - 1)) / COLS;
  const usableBottom = doc.page.height - M_BOTTOM;

  // Pre-index actors by id to avoid O(n*m) lookups in the assignments loop
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const charToActor = new Map<string, Actor>();
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    const actor = actorById.get(a.actorId);
    if (actor) charToActor.set(a.characterId, actor);
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  const mustDouble = new Map<string, string[]>();
  for (const [a, b] of characterLinks) {
    if (!mustDouble.has(a)) mustDouble.set(a, []);
    if (!mustDouble.has(b)) mustDouble.set(b, []);
    mustDouble.get(a)!.push(b);
    mustDouble.get(b)!.push(a);
  }

  const speakingCharIds = new Set<string>();
  // Group speeches by character in one pass to avoid O(n*m) fully-cut detection later
  const speechesByChar = new Map<string, Array<{ id: string }>>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          speakingCharIds.add(unit.characterId);
          if (!speechesByChar.has(unit.characterId)) speechesByChar.set(unit.characterId, []);
          speechesByChar.get(unit.characterId)!.push({ id: unit.id });
        }
      }
    }
  }

  const fullyCutCharIds = new Set<string>(
    [...speakingCharIds].filter((charId) => {
      const speeches = speechesByChar.get(charId) ?? [];
      return speeches.length > 0 && speeches.every((s) => cut.cutMap[s.id] === "cut");
    })
  );

  const activeChars = play.castList.filter(
    (c) => speakingCharIds.has(c.id) && !fullyCutCharIds.has(c.id)
  );

  const title = projectName ?? play.title;
  const subtitle = [play.title, ...(optionName ? [`Cast: ${optionName}`] : [])].join(" · ");
  const printDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let currentY = M_TOP;

  function drawPageHeader() {
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111")
      .text(title, M_LEFT, currentY, { width: contentW });
    currentY = doc.y;
    if (subtitle) {
      doc.font("Helvetica").fontSize(10).fillColor("#555555")
        .text(subtitle, M_LEFT, currentY, { width: contentW });
      currentY = doc.y;
    }
    doc.font("Helvetica").fontSize(9).fillColor("#999999")
      .text(`Generated ${printDate}`, M_LEFT, currentY, { width: contentW });
    currentY = doc.y + 12;
  }

  function drawSectionHeader(label: string) {
    if (currentY + 30 > usableBottom) {
      doc.addPage();
      currentY = M_TOP;
    }
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#555555")
      .text(label.toUpperCase(), M_LEFT, currentY, { width: contentW, characterSpacing: 0.8 });
    currentY = doc.y + 2;
    doc.moveTo(M_LEFT, currentY).lineTo(M_LEFT + contentW, currentY)
      .strokeColor("#cccccc").lineWidth(0.5).stroke();
    currentY += 8;
  }

  function charCardHeight(charId: string): number {
    const linked = (mustDouble.get(charId) ?? []).length;
    return 14 + 14 + (3 + (linked > 0 ? 1 : 0)) * 13 + 16;
  }

  function actorCardHeight(actorId: string): number {
    const charIds = (actorToChars.get(actorId) ?? []).filter((id) => !fullyCutCharIds.has(id));
    const rows = Math.max(charIds.length, 4);
    return 14 + 14 + rows * 13 + 16;
  }

  function drawGrid<T>(
    items: T[],
    heightFn: (item: T) => number,
    drawFn: (item: T, x: number, y: number, w: number) => number
  ) {
    let col = 0;
    let rowY = currentY;
    let rowMaxH = 0;

    for (const item of items) {
      const h = heightFn(item);
      if (col === 0 && rowY + h > usableBottom) {
        doc.addPage();
        rowY = M_TOP;
      }
      const x = M_LEFT + col * (cardW + GAP);
      const actualH = drawFn(item, x, rowY, cardW);
      rowMaxH = Math.max(rowMaxH, actualH);

      col++;
      if (col >= COLS) {
        col = 0;
        rowY += rowMaxH + GAP;
        rowMaxH = 0;
      }
    }
    if (col > 0) currentY = rowY + rowMaxH + GAP;
    else currentY = rowY;
  }

  function drawCharCard(char: { id: string; name: string }, x: number, y: number, w: number): number {
    const displayName = resolveCharacterName(char.id, cut.characterAliases, play.castList);
    const actor = charToActor.get(char.id);
    const lines = lineCounts.byCharacter[char.id]?.afterCut ?? 0;
    const words = lineCounts.words?.byCharacter[char.id]?.afterCut ?? 0;
    const time = stageTime?.byCharacter[char.id]?.minutes ?? 0;
    const linkedNames = (mustDouble.get(char.id) ?? [])
      .map((id) => resolveCharacterName(id, cut.characterAliases, play.castList))
      .join(", ");

    let innerY = y + 8;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
      .text(displayName, x + 8, innerY, { width: w - 16, lineBreak: false });
    innerY += 14;

    const blankRight = x + w - 8;
    doc.moveTo(x + 8, innerY + 9).lineTo(blankRight, innerY + 9)
      .strokeColor("#888888").lineWidth(0.5).stroke();
    if (actor) {
      doc.font("Helvetica").fontSize(9).fillColor("#333333")
        .text(actor.name, x + 8, innerY, { width: w - 16, lineBreak: false });
    }
    innerY += 14;

    const statLabelW = 60;
    const rows: Array<[string, string]> = [
      ["Lines", String(lines)],
      ["Words", String(words)],
      ["Stage time", fmtMins(time)],
    ];
    if (linkedNames) rows.push(["Must double", linkedNames]);

    for (const [label, val] of rows) {
      doc.font("Helvetica").fontSize(8).fillColor("#666666")
        .text(label, x + 8, innerY, { width: statLabelW, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#111111")
        .text(val, x + 8 + statLabelW, innerY, { width: w - 16 - statLabelW, lineBreak: false });
      innerY += 13;
    }

    const totalH = innerY - y + 8;
    doc.rect(x, y, w, totalH).dash(3, { space: 3 }).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
    doc.undash();
    return totalH;
  }

  function drawActorCard(actor: Actor, x: number, y: number, w: number): number {
    const charIds = (actorToChars.get(actor.id) ?? []).filter((id) => !fullyCutCharIds.has(id));
    const colW = (w - 16) / 4;

    let innerY = y + 8;

    const dotR = 4;
    doc.circle(x + 8 + dotR, innerY + 6, dotR).fillColor(actor.color).fill();
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
      .text(actor.name, x + 8 + dotR * 2 + 4, innerY, { width: w - 16 - dotR * 2 - 4, lineBreak: false });
    innerY += 16;

    doc.font("Helvetica").fontSize(7).fillColor("#888888");
    const headers = ["Character", "Lines", "Words", "Time"];
    for (let i = 0; i < headers.length; i++) {
      const align = i === 0 ? "left" : "right";
      doc.text(headers[i].toUpperCase(), x + 8 + i * colW, innerY, { width: colW, align, lineBreak: false });
    }
    innerY += 11;
    doc.moveTo(x + 8, innerY).lineTo(x + w - 8, innerY).strokeColor("#dddddd").lineWidth(0.3).stroke();
    innerY += 4;

    if (charIds.length === 0) {
      for (let i = 0; i < 4; i++) {
        doc.moveTo(x + 8, innerY + 9).lineTo(x + w - 8, innerY + 9)
          .strokeColor("#dddddd").lineWidth(0.3).dash(2, { space: 2 }).stroke();
        doc.undash();
        innerY += 13;
      }
    } else {
      let totalLines = 0, totalWords = 0, totalTime = 0;
      for (const id of charIds) {
        const name = resolveCharacterName(id, cut.characterAliases, play.castList);
        const lineCount = lineCounts.byCharacter[id]?.afterCut ?? 0;
        const wordCount = lineCounts.words?.byCharacter[id]?.afterCut ?? 0;
        const stageTimeMin = stageTime?.byCharacter[id]?.minutes ?? 0;
        totalLines += lineCount; totalWords += wordCount; totalTime += stageTimeMin;

        doc.font("Helvetica").fontSize(8).fillColor("#111111")
          .text(name, x + 8, innerY, { width: colW, lineBreak: false });
        doc.text(String(lineCount), x + 8 + colW, innerY, { width: colW, align: "right", lineBreak: false });
        doc.text(String(wordCount), x + 8 + colW * 2, innerY, { width: colW, align: "right", lineBreak: false });
        doc.text(fmtMins(stageTimeMin), x + 8 + colW * 3, innerY, { width: colW, align: "right", lineBreak: false });
        innerY += 13;
      }
      doc.moveTo(x + 8, innerY).lineTo(x + w - 8, innerY).strokeColor("#cccccc").lineWidth(0.3).stroke();
      innerY += 4;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#111111")
        .text("Total", x + 8, innerY, { width: colW, lineBreak: false });
      doc.text(String(totalLines), x + 8 + colW, innerY, { width: colW, align: "right", lineBreak: false });
      doc.text(String(totalWords), x + 8 + colW * 2, innerY, { width: colW, align: "right", lineBreak: false });
      doc.text(fmtMins(totalTime), x + 8 + colW * 3, innerY, { width: colW, align: "right", lineBreak: false });
      innerY += 13;
    }

    const totalH = innerY - y + 8;
    doc.rect(x, y, w, totalH).dash(3, { space: 3 }).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
    doc.undash();
    return totalH;
  }

  drawPageHeader();
  drawSectionHeader(`Characters (${activeChars.length})`);
  drawGrid(activeChars, (c) => charCardHeight(c.id), (c, x, y, w) => drawCharCard(c, x, y, w));

  currentY += 8;
  drawSectionHeader(`Actors (${actors.length})`);
  drawGrid(actors, (a) => actorCardHeight(a.id), (a, x, y, w) => drawActorCard(a, x, y, w));

  return pdfToBuffer(doc);
}
