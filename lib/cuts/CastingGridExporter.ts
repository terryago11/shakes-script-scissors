import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";

function fmtMins(m: number): string {
  if (m <= 0) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportCastingGrid(params: {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
  lineCounts: LineCounts;
  stageTime: StageTimeResult | null;
  characterLinks: Array<[string, string]>;
  projectName?: string;
  optionName?: string;
}): string {
  const { play, cut, actors, assignments, lineCounts, stageTime, characterLinks, projectName, optionName } = params;

  const charToActor = new Map<string, Actor>();
  for (const a of assignments) {
    const actor = actors.find((ac) => ac.id === a.actorId);
    if (actor) charToActor.set(a.characterId, actor);
  }

  // Build per-actor character lists for actor cards
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  // Must-double links: build lookup from charId → linked charIds
  const mustDouble = new Map<string, string[]>();
  for (const [a, b] of characterLinks) {
    if (!mustDouble.has(a)) mustDouble.set(a, []);
    if (!mustDouble.has(b)) mustDouble.set(b, []);
    mustDouble.get(a)!.push(b);
    mustDouble.get(b)!.push(a);
  }

  // Speaking chars that have at least some kept lines or a stage appearance
  const speakingCharIds = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") speakingCharIds.add(unit.characterId);
      }
    }
  }

  // Filter fully-cut characters
  const allSpeeches: Array<{ id: string; characterId: string }> = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") allSpeeches.push({ id: unit.id, characterId: unit.characterId });
      }
    }
  }
  const fullyCutCharIds = new Set<string>(
    [...speakingCharIds].filter((charId) => {
      const speeches = allSpeeches.filter((s) => s.characterId === charId);
      return speeches.length > 0 && speeches.every((s) => cut.cutMap[s.id] === "cut");
    })
  );

  const activeChars = play.castList.filter(
    (c) => speakingCharIds.has(c.id) && !fullyCutCharIds.has(c.id)
  );

  const title = esc(projectName ?? play.title);
  const subtitle = [esc(play.title), optionName ? `Cast: ${esc(optionName)}` : null]
    .filter(Boolean)
    .join(" · ");
  const printDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // ── Character cards ────────────────────────────────────────────────────────
  const charCards = activeChars.map((char) => {
    const displayName = resolveCharacterName(char.id, cut.characterAliases, play.castList);
    const actor = charToActor.get(char.id);
    const lines = lineCounts.byCharacter[char.id]?.afterCut ?? 0;
    const words = lineCounts.words?.byCharacter[char.id]?.afterCut ?? 0;
    const time = stageTime?.byCharacter[char.id]?.minutes ?? 0;
    const linkedNames = (mustDouble.get(char.id) ?? [])
      .map((id) => resolveCharacterName(id, cut.characterAliases, play.castList))
      .join(", ");

    const actorBlock = actor
      ? `<div class="actor-swatch" style="background:${esc(actor.color)};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;"></div><strong>${esc(actor.name)}</strong>`
      : `<span class="uncast">Uncast</span>`;

    return `<div class="card">
  <div class="card-title">${esc(displayName)}</div>
  <div class="card-actor">${actorBlock}</div>
  <table class="stats">
    <tr><td class="stat-label">Lines</td><td class="stat-val">${lines}</td></tr>
    <tr><td class="stat-label">Words</td><td class="stat-val">${words}</td></tr>
    <tr><td class="stat-label">Stage time</td><td class="stat-val">${fmtMins(time)}</td></tr>
    ${linkedNames ? `<tr><td class="stat-label">Must double</td><td class="stat-val">${esc(linkedNames)}</td></tr>` : ""}
  </table>
</div>`;
  }).join("\n");

  // ── Actor cards ────────────────────────────────────────────────────────────
  const actorCards = actors.map((actor) => {
    const charIds = actorToChars.get(actor.id) ?? [];
    const activeCharIds = charIds.filter((id) => !fullyCutCharIds.has(id));

    const totalLines = activeCharIds.reduce((s, id) => s + (lineCounts.byCharacter[id]?.afterCut ?? 0), 0);
    const totalWords = activeCharIds.reduce((s, id) => s + (lineCounts.words?.byCharacter[id]?.afterCut ?? 0), 0);
    const totalTime = activeCharIds.reduce((s, id) => s + (stageTime?.byCharacter[id]?.minutes ?? 0), 0);

    const rows = activeCharIds.map((id) => {
      const name = resolveCharacterName(id, cut.characterAliases, play.castList);
      const l = lineCounts.byCharacter[id]?.afterCut ?? 0;
      const w = lineCounts.words?.byCharacter[id]?.afterCut ?? 0;
      const t = stageTime?.byCharacter[id]?.minutes ?? 0;
      return `<tr><td>${esc(name)}</td><td>${l}</td><td>${w}</td><td>${fmtMins(t)}</td></tr>`;
    }).join("\n");

    return `<div class="card">
  <div class="card-title">
    <span class="actor-swatch" style="background:${esc(actor.color)};display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>${esc(actor.name)}
  </div>
  <table class="actor-table">
    <thead><tr><th>Character</th><th>Lines</th><th>Words</th><th>Time</th></tr></thead>
    <tbody>
      ${rows || "<tr><td colspan='4' style='color:#888;font-style:italic'>No characters assigned</td></tr>"}
    </tbody>
    <tfoot>
      <tr class="totals-row"><td><strong>Total</strong></td><td><strong>${totalLines}</strong></td><td><strong>${totalWords}</strong></td><td><strong>${fmtMins(totalTime)}</strong></td></tr>
    </tfoot>
  </table>
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Casting Sheet</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, serif; font-size: 13px; color: #111; background: #fff; padding: 16px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 4px; }
  .print-date { color: #999; font-size: 11px; margin-bottom: 16px; }
  h2 { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; color: #555;
       border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 20px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .card {
    border: 1px dashed #bbb;
    border-radius: 4px;
    padding: 10px 12px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .card-title { font-size: 15px; font-weight: bold; margin-bottom: 6px; }
  .card-actor { font-size: 12px; margin-bottom: 8px; color: #333; }
  .uncast { color: #aaa; font-style: italic; }
  .stats { width: 100%; border-collapse: collapse; font-size: 12px; }
  .stat-label { color: #666; padding: 1px 6px 1px 0; white-space: nowrap; }
  .stat-val { font-variant-numeric: tabular-nums; }
  .actor-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .actor-table th { text-align: left; border-bottom: 1px solid #ddd; padding: 2px 4px;
                    font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
  .actor-table td { padding: 2px 4px; border-bottom: 1px solid #f0f0f0; }
  .actor-table tfoot td { border-top: 1px solid #ccc; border-bottom: none; padding-top: 4px; }
  .totals-row td { font-weight: bold; }
  @media print {
    body { padding: 8px; font-size: 12px; }
    h2 { margin-top: 14px; }
    .grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .card { border-color: #888; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="no-print" style="margin-bottom:12px;">
  <button onclick="window.print()" style="padding:6px 14px;font-size:13px;cursor:pointer;border:1px solid #999;border-radius:4px;background:#f5f5f5;">
    Print / Save PDF
  </button>
</div>

<h1>${title}</h1>
<div class="subtitle">${subtitle}</div>
<div class="print-date">Generated ${printDate}</div>

<h2>Characters (${activeChars.length})</h2>
<div class="grid">
${charCards}
</div>

<h2>Actors (${actors.length})</h2>
<div class="grid">
${actorCards}
</div>
</body>
</html>`;
}
