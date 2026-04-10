/**
 * Server-only: renders a CueScript to a PDF Buffer using pdfkit.
 * Do NOT import this from client components.
 */
import PDFDocument from "pdfkit";
import type { CueScript, CueEntry } from "@/types/cut";

// pdfkit is listed in serverExternalPackages in next.config.ts so its __dirname
// resolves correctly and built-in AFM fonts work.

// Page margins (points) — used for content flow logic (needsBreak, footer placement).
// The PDFDocument is created with much smaller margins so pdfkit never auto-adds
// blank pages when we draw headers/footers in the margin zone.
const M_TOP = 60;
const M_BOTTOM = 60;
const M_LEFT = 72;
const M_RIGHT = 72;
const FOOTER_H = 18;
// pdfkit's own declared margin — kept small so the engine doesn't auto-add pages
// when we explicitly draw text at footer/header y-positions.
const PDF_MARGIN = 16;

export function sanitizeName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function buildPdfFileName(actorName: string): string {
  return `${sanitizeName(actorName)}_cue_script.pdf`;
}

export function buildZipFileName(playTitle: string, cutName: string): string {
  return `${sanitizeName(playTitle)}_${sanitizeName(cutName)}_cue_scripts.zip`;
}

export function buildDocxFileName(playTitle: string, cutName: string): string {
  return `${sanitizeName(playTitle)}_${sanitizeName(cutName)}_cue_scripts.docx`;
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// A small renderer class that tracks the current y position and handles
// manual page breaks without relying on the pageAdded event.
class PdfRenderer {
  private doc: PDFKit.PDFDocument;
  private pageNum = 1;
  private pageHeight: number;
  private contentWidth: number;
  private usableBottom: number;

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
    this.pageHeight = doc.page.height;
    this.contentWidth = doc.page.width - M_LEFT - M_RIGHT;
    this.usableBottom = this.pageHeight - M_BOTTOM - FOOTER_H - 8;
  }

  get y() { return this.doc.y; }
  set y(v: number) { this.doc.y = v; }

  get width() { return this.contentWidth; }

  needsBreak(approxHeight = 30) {
    return this.doc.y > this.usableBottom - approxHeight;
  }

  newPage(cueScript: CueScript, dateStr: string) {
    this.doc.addPage();
    this.pageNum++;
    // Running header on pages 2+
    this.doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#999999")
      .text(cueScript.playTitle, M_LEFT, 20, { width: this.contentWidth / 2, align: "left" });
    this.doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#999999")
      .text(cueScript.actorName, M_LEFT + this.contentWidth / 2, 20, {
        width: this.contentWidth / 2,
        align: "right",
      });
    this.doc
      .moveTo(M_LEFT, 32)
      .lineTo(M_LEFT + this.contentWidth, 32)
      .strokeColor("#e0e0e0")
      .lineWidth(0.3)
      .stroke();
    // Footer
    this.drawFooter(dateStr);
    this.doc.y = M_TOP + 10;
  }

  drawFooter(dateStr: string) {
    // Place footer inside M_BOTTOM zone but above PDF_MARGIN hard limit.
    const footerY = this.pageHeight - M_BOTTOM + 10;
    this.doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#aaaaaa")
      .text(
        `Page ${this.pageNum}  ·  ${dateStr}  ·  Shakespeare Script Scissors`,
        M_LEFT,
        footerY,
        { width: this.contentWidth, align: "center" }
      );
  }
}

export async function renderCueScriptPdf(
  cueScript: CueScript,
  characterNames: string[]
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    // Use small pdfkit margins so it never auto-inserts blank pages when we draw
    // headers/footers at positions inside our own M_TOP/M_BOTTOM zones.
    margins: { top: PDF_MARGIN, bottom: PDF_MARGIN, left: M_LEFT, right: M_RIGHT },
    info: {
      Title: `${cueScript.playTitle} — ${cueScript.actorName} Cue Script`,
      Author: "Shakespeare Script Scissors",
    },
    autoFirstPage: true,
    bufferPages: false,
  });

  const renderer = new PdfRenderer(doc);
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Page 1 footer only (no header on first page)
  renderer.drawFooter(dateStr);
  doc.y = M_TOP + 4;

  // Cover block
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#888888")
    .text(cueScript.playTitle.toUpperCase(), M_LEFT, doc.y, {
      width: renderer.width,
      align: "center",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#1a1a1a")
    .text(cueScript.actorName, M_LEFT, doc.y + 4, {
      width: renderer.width,
      align: "center",
    });

  if (characterNames.length > 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor("#555555")
      .text(characterNames.join(" · "), M_LEFT, doc.y + 2, {
        width: renderer.width,
        align: "center",
      });
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#888888")
    .text(`Cut: ${cueScript.cutName}`, M_LEFT, doc.y + 2, {
      width: renderer.width,
      align: "center",
    });

  const ruleY = doc.y + 8;
  doc
    .moveTo(M_LEFT, ruleY)
    .lineTo(M_LEFT + renderer.width, ruleY)
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .stroke();

  doc.y = ruleY + 14;

  // Entries
  for (const entry of cueScript.entries) {
    renderEntry(doc, renderer, entry, cueScript, dateStr);
  }

  return pdfToBuffer(doc);
}

function renderEntry(
  doc: PDFKit.PDFDocument,
  renderer: PdfRenderer,
  entry: CueEntry,
  cueScript: CueScript,
  dateStr: string
) {
  switch (entry.type) {
    case "cue": {
      if (renderer.needsBreak(40)) renderer.newPage(cueScript, dateStr);
      const cueWidth = renderer.width * 0.6;
      const cueX = M_LEFT + renderer.width - cueWidth;

      if (entry.cueSpeakerName) {
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#aaaaaa")
          .text(entry.cueSpeakerName.toUpperCase(), cueX, doc.y, {
            width: cueWidth,
            align: "right",
            lineBreak: false,
          });
        doc.y += 10;
      }

      const blockTop = doc.y;
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .fillColor("#555555")
        .text(entry.text, cueX, doc.y, { width: cueWidth, align: "right" });
      const blockBottom = doc.y;

      // Right border accent
      doc
        .moveTo(M_LEFT + renderer.width + 4, blockTop)
        .lineTo(M_LEFT + renderer.width + 4, blockBottom)
        .strokeColor("#bbbbbb")
        .lineWidth(1.5)
        .stroke();

      doc.y = blockBottom + 6;
      break;
    }

    case "lines": {
      if (renderer.needsBreak(35)) renderer.newPage(cueScript, dateStr);

      if (entry.characterName) {
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#333333")
          .text(entry.characterName.toUpperCase(), M_LEFT, doc.y, {
            width: renderer.width,
            lineBreak: false,
          });
        doc.y += 11;
      }

      const lines = entry.text.split("\n");
      for (const line of lines) {
        if (renderer.needsBreak(16)) renderer.newPage(cueScript, dateStr);
        doc
          .font("Times-Roman")
          .fontSize(11)
          .fillColor("#1a1a1a")
          .text(line || " ", M_LEFT, doc.y, { width: renderer.width });
      }

      doc.y += 6;
      break;
    }

    case "stage": {
      if (renderer.needsBreak(20)) renderer.newPage(cueScript, dateStr);
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor("#666666")
        .text(`[${entry.text}]`, M_LEFT, doc.y, {
          width: renderer.width,
          align: "center",
        });
      doc.y += 6;
      break;
    }
  }
}
