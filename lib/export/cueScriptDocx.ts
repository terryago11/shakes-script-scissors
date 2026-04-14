/**
 * Server-only: renders an array of CueScripts to a single combined DOCX Buffer.
 * Do NOT import this from client components.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
} from "docx";
import type { CueScript, CueEntry } from "@/types/cut";

function cueParagraphs(entry: CueEntry): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (entry.cueSpeakerName) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: entry.cueSpeakerName.toUpperCase(),
            size: 16, // 8pt
            color: "999999",
            smallCaps: true,
          }),
        ],
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: {
        right: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 4 },
      },
      children: [
        new TextRun({
          text: entry.text,
          italics: true,
          size: 20, // 10pt
          color: "555555",
        }),
      ],
    })
  );

  return paragraphs;
}

function linesParagraphs(entry: CueEntry): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (entry.characterName) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: entry.characterName.toUpperCase(),
            bold: true,
            size: 16, // 8pt
            color: "333333",
          }),
        ],
      })
    );
  }

  const lines = entry.text.split("\n");
  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 22, // 11pt
            color: "1a1a1a",
          }),
        ],
      })
    );
  }

  return paragraphs;
}

function stageParagraph(entry: CueEntry): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: `[${entry.text}]`,
        italics: true,
        size: 18, // 9pt
        color: "666666",
      }),
    ],
  });
}

function actorSection(cueScript: CueScript, characterNames: string[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Actor name heading
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: cueScript.actorName })],
    })
  );

  // Character list
  if (characterNames.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: characterNames.join(" · ") })],
      })
    );
  }

  // Play + cut line
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${cueScript.playTitle}  ·  Cut: ${cueScript.cutName}`,
          size: 16,
          color: "888888",
        }),
      ],
    })
  );

  // Divider (empty paragraph with bottom border)
  paragraphs.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 },
      },
      children: [],
    })
  );

  // Entries
  for (const entry of cueScript.entries) {
    switch (entry.type) {
      case "cue":
        paragraphs.push(...cueParagraphs(entry));
        break;
      case "lines":
        paragraphs.push(...linesParagraphs(entry));
        break;
      case "stage":
        paragraphs.push(stageParagraph(entry));
        break;
    }
    // Small spacing paragraph between entries
    paragraphs.push(new Paragraph({ children: [] }));
  }

  return paragraphs;
}

export interface CueScriptWithCharNames {
  cueScript: CueScript;
  characterNames: string[];
}

export async function renderCueScriptsDocx(
  scripts: CueScriptWithCharNames[]
): Promise<Buffer> {
  const children: Paragraph[] = [];

  for (let i = 0; i < scripts.length; i++) {
    const { cueScript, characterNames } = scripts[i];
    const section = actorSection(cueScript, characterNames);
    children.push(...section);

    // Page break between actors (not after last)
    if (i < scripts.length - 1) {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
