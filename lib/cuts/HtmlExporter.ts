import type { Play, Speech, StageDirection } from "@/types/play";
import type { Cut } from "@/types/project";
import { applyEditsToLine, segmentsToText } from "./applyEdits";
import { resolveCharacterName } from "@/lib/project/projectUtils";

/** Escape a string for safe HTML embedding */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate a self-contained HTML document of the cut script.
 *
 * Output is "clean mode": cut units are omitted entirely.
 * Custom scene order, character aliases, speech reassignments,
 * line cuts, word-level edits, and pauses are all respected.
 * The resulting .html file requires no server or JavaScript to view.
 */
export function generateScriptHtml(
  play: Play,
  cut: Cut,
  projectName?: string
): string {
  const aliases = cut.characterAliases ?? {};
  const reassignments = cut.speechReassignments ?? {};
  const lineCutMap = cut.lineCutMap ?? {};
  const speechEdits = cut.speechEdits ?? {};
  const sdEdits = cut.stageDirectionEdits ?? {};
  const pauses = cut.pauses ?? {};

  // Build sceneId → { act, scene } lookup
  const sceneMap = new Map<string, { actTitle: string; actId: string; sceneTitle: string; units: Play["acts"][0]["scenes"][0]["units"] }>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, {
        actTitle: act.title || `Act ${act.number}`,
        actId: act.id,
        sceneTitle: scene.title || `Scene ${scene.number}`,
        units: scene.units,
      });
    }
  }

  // Effective scene order (respects cut.sceneOrder)
  const allSceneIds = play.acts.flatMap((a) => a.scenes.map((s) => s.id));
  const effectiveOrder: string[] = cut.sceneOrder ?? allSceneIds;

  // Build HTML body
  const parts: string[] = [];
  let lastActId: string | null = null;

  for (const sceneId of effectiveOrder) {
    const info = sceneMap.get(sceneId);
    if (!info) continue;

    // Act header when act changes
    if (info.actId !== lastActId) {
      lastActId = info.actId;
      parts.push(`<div class="act-header">${esc(info.actTitle)}</div>`);
    }

    // Scene header
    parts.push(`<div class="scene-header">${esc(info.sceneTitle)}</div>`);

    // Units
    for (const unit of info.units) {
      if (cut.cutMap[unit.id] === "cut") continue;

      if (unit.type === "speech") {
        const speech = unit as Speech;
        const effectiveCharId = reassignments[speech.id] ?? speech.characterId;
        const charName = resolveCharacterName(effectiveCharId, aliases, play.castList);

        const edit = speechEdits[speech.id];
        const ops = edit?.ops ?? [];
        const keptLines = speech.lines
          .filter((l) => lineCutMap[l.id] !== "cut")
          .map((l) => {
            const lineOps = ops.filter((op) => op.lineId === l.id);
            if (lineOps.length === 0) return l.text;
            const segments = applyEditsToLine(l.id, l.text, lineOps);
            return segmentsToText(segments);
          })
          .filter((text) => text.trim().length > 0);

        if (keptLines.length === 0) continue;

        parts.push(
          `<div class="speech">` +
            `<div class="char-name">${esc(charName)}</div>` +
            `<div class="speech-lines">${keptLines.map((l) => `<div class="speech-line">${esc(l)}</div>`).join("")}</div>` +
          `</div>`
        );
      } else if (unit.type === "stage") {
        const stage = unit as StageDirection;
        // Use effective characters (respects stageDirectionEdits) — just render the text
        const effectiveText =
          sdEdits[stage.id]
            ? stage.text // text body unchanged; character list is metadata
            : stage.text;
        parts.push(`<div class="stage-dir">[${esc(effectiveText)}]</div>`);
      }
    }

    // Pause after this scene
    const pause = pauses[`after:${sceneId}`];
    if (pause) {
      parts.push(
        `<div class="pause">— ${esc(pause.name)} (${pause.minutes} min) —</div>`
      );
    }
  }

  // Header block
  const showProjectName = projectName && projectName !== play.title;
  const headerHtml =
    `<div class="header">` +
    `<div class="play-title">${esc(play.title)}</div>` +
    (showProjectName ? `<div class="project-name">${esc(projectName!)}</div>` : "") +
    `<div class="cut-name">Cut: ${esc(cut.name)}</div>` +
    `<hr class="header-rule">` +
    `</div>`;

  // Inline CSS — no external dependencies
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.65;color:#1c1917;background:#fff}
.script{max-width:720px;margin:0 auto;padding:48px 56px}
@media print{.script{padding:20px 24px}}
.header{text-align:center;margin-bottom:48px}
.play-title{font-size:22px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.project-name{font-size:12px;color:#78716c;margin-bottom:2px}
.cut-name{font-size:12px;color:#78716c}
.header-rule{border:none;border-top:1px solid #d6d3d1;margin-top:20px}
.act-header{font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;margin:48px 0 8px;border-bottom:2px solid #292524;padding-bottom:6px;break-after:avoid}
.scene-header{font-size:12px;font-style:italic;color:#57534e;margin:20px 0 10px;break-after:avoid}
.speech{margin-bottom:16px;break-inside:avoid}
.char-name{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#57534e;margin-bottom:2px}
.speech-line{margin-bottom:0}
.stage-dir{text-align:center;font-style:italic;color:#57534e;font-size:13px;margin:10px 0;break-inside:avoid}
.pause{text-align:center;border-top:1px dashed #d6d3d1;border-bottom:1px dashed #d6d3d1;padding:14px 0;margin:28px 0;font-size:13px;color:#78716c;font-style:italic}
`.trim();

  const pageTitle = `${esc(play.title)}${cut.name ? ` — ${esc(cut.name)}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
<style>${css}</style>
</head>
<body>
<div class="script">
${headerHtml}
${parts.join("\n")}
</div>
</body>
</html>`;
}
