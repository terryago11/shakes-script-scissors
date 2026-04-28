import type { CueScript } from "@/types/cut";
import type { Actor } from "@/types/project";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Group flat CueScript entries into drill cards.
 *
 * Each card has an optional cue (the prompt) and one or more response entries
 * (the actor's lines and relevant stage directions). A new card starts whenever
 * a "cue" entry appears.
 */
interface DrillCard {
  cueText: string | null;
  cueSpeaker: string | null;
  responses: Array<{ type: "lines" | "stage"; text: string; characterName?: string }>;
}

function buildCards(entries: CueScript["entries"]): DrillCard[] {
  const cards: DrillCard[] = [];
  let current: DrillCard | null = null;

  for (const entry of entries) {
    if (entry.type === "cue") {
      if (current) cards.push(current);
      current = { cueText: entry.text, cueSpeaker: entry.cueSpeakerName ?? null, responses: [] };
    } else {
      if (!current) {
        // Lines/stage before any cue — open an implicit first card
        current = { cueText: null, cueSpeaker: null, responses: [] };
      }
      current.responses.push({ type: entry.type as "lines" | "stage", text: entry.text, characterName: entry.characterName });
    }
  }
  if (current) cards.push(current);
  // Drop cards that have no responses (pure trailing cue with nothing after)
  return cards.filter((c) => c.responses.length > 0);
}

export function exportLineBuddy(cueScript: CueScript, actor: Actor): string {
  const cards = buildCards(cueScript.entries);
  const cardData = JSON.stringify(
    cards.map((c) => ({
      cue: c.cueText,
      cueSpeaker: c.cueSpeaker,
      responses: c.responses,
    }))
  );

  const title = esc(`${actor.name} — Line Buddy`);
  const subtitle = esc(`${cueScript.playTitle} · ${cueScript.cutName}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --amber: #d97706;
    --amber-light: #fef3c7;
    --stone: #78716c;
    --stone-light: #f5f5f4;
    --card-bg: #fff;
    --text: #1c1917;
    --muted: #78716c;
    --border: #e7e5e4;
    --reveal-bg: #fffbeb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --amber: #fbbf24;
      --amber-light: #451a03;
      --card-bg: #1c1917;
      --text: #f5f5f4;
      --muted: #a8a29e;
      --border: #44403c;
      --stone-light: #292524;
      --reveal-bg: #1c1400;
    }
  }
  html, body { height: 100%; }
  body {
    font-family: Georgia, serif;
    background: var(--stone-light);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100%;
    padding: 0;
    touch-action: manipulation;
  }

  /* ── Header ───────────────────────────────────────────────── */
  header {
    width: 100%;
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  header h1 { font-size: 15px; font-weight: bold; flex: 1; }
  header .sub { font-size: 11px; color: var(--muted); display: block; font-style: italic; }
  .progress-bar-wrap {
    position: sticky;
    top: 49px;
    width: 100%;
    height: 4px;
    background: var(--border);
    z-index: 9;
  }
  .progress-bar {
    height: 100%;
    background: var(--amber);
    transition: width .25s ease;
    width: 0%;
  }

  /* ── Main card area ──────────────────────────────────────── */
  main {
    width: 100%;
    max-width: 640px;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Cue zone */
  .cue-zone {
    border-left: 3px solid var(--amber);
    padding: 8px 12px;
    margin-bottom: 16px;
    font-style: italic;
    color: var(--muted);
    font-size: 15px;
  }
  .cue-zone .cue-speaker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--amber);
    display: block;
    margin-bottom: 3px;
    font-style: normal;
  }
  .cue-zone .cue-text { font-size: 16px; }
  .cue-zone .cue-opening { color: var(--muted); font-size: 13px; font-style: normal; }

  /* Answer zone */
  .answer-zone {
    flex: 1;
    border-radius: 8px;
    background: var(--reveal-bg);
    padding: 14px 16px;
    transition: opacity .2s;
  }
  .answer-zone.hidden { visibility: hidden; opacity: 0; }
  .speech-block { margin-bottom: 10px; }
  .speech-block:last-child { margin-bottom: 0; }
  .speech-name {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--amber);
    margin-bottom: 4px;
  }
  .speech-text {
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .stage-dir {
    font-size: 13px;
    font-style: italic;
    color: var(--muted);
    padding-left: 12px;
    margin: 4px 0;
  }

  /* Counter */
  .counter {
    text-align: center;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 10px;
  }

  /* ── Buttons ─────────────────────────────────────────────── */
  .btn-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  button {
    min-height: 44px;
    padding: 8px 20px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card-bg);
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: background .15s;
    -webkit-tap-highlight-color: transparent;
  }
  button:hover { background: var(--stone-light); }
  button:active { opacity: .75; }
  .btn-primary {
    background: var(--amber);
    color: #fff;
    border-color: var(--amber);
    font-weight: bold;
    min-width: 140px;
  }
  .btn-primary:hover { opacity: .9; background: var(--amber); }
  .btn-sm { font-size: 12px; min-height: 36px; padding: 6px 14px; }
  .btn-active { background: var(--amber-light); border-color: var(--amber); }

  /* ── Empty state ─────────────────────────────────────────── */
  .empty {
    text-align: center;
    color: var(--muted);
    font-style: italic;
    padding: 40px 20px;
  }

  @media (max-width: 400px) {
    main { padding: 10px; }
    .card { padding: 14px; }
    .speech-text { font-size: 15px; }
  }
</style>
</head>
<body>

<header>
  <div style="flex:1;min-width:0;">
    <h1>${title}</h1>
    <span class="sub">${subtitle}</span>
  </div>
</header>
<div class="progress-bar-wrap"><div class="progress-bar" id="prog"></div></div>

<main id="app">
  <div class="empty">Loading…</div>
</main>

<script>
const ALL_CARDS = ${cardData};

let order = [];
let idx = 0;
let revealed = false;
let shuffleOn = false;

function fisherYates(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resetOrder() {
  order = shuffleOn
    ? fisherYates(ALL_CARDS.map((_, i) => i))
    : ALL_CARDS.map((_, i) => i);
  idx = 0;
  revealed = false;
}

function currentCard() { return ALL_CARDS[order[idx]]; }

function updateProgress() {
  const pct = ALL_CARDS.length === 0 ? 0 : Math.round((idx / ALL_CARDS.length) * 100);
  document.getElementById('prog').style.width = pct + '%';
}

function render() {
  const app = document.getElementById('app');
  if (ALL_CARDS.length === 0) {
    app.innerHTML = '<div class="empty">No lines found for this actor.</div>';
    return;
  }

  const card = currentCard();
  const total = ALL_CARDS.length;
  const num = idx + 1;

  // Cue zone
  let cueHtml;
  if (card.cue) {
    const speaker = card.cueSpeaker
      ? '<span class="cue-speaker">' + esc(card.cueSpeaker) + '</span>'
      : '';
    cueHtml = '<div class="cue-zone">' + speaker +
      '<span class="cue-text">…' + esc(card.cue) + '</span></div>';
  } else {
    cueHtml = '<div class="cue-zone"><span class="cue-opening">— Beginning —</span></div>';
  }

  // Answer zone
  let answerHtml = '';
  for (const r of card.responses) {
    if (r.type === 'lines') {
      const name = r.characterName
        ? '<div class="speech-name">' + esc(r.characterName) + '</div>'
        : '';
      answerHtml += '<div class="speech-block">' + name +
        '<div class="speech-text">' + esc(r.text) + '</div></div>';
    } else {
      answerHtml += '<div class="stage-dir">[' + esc(r.text) + ']</div>';
    }
  }

  const hidden = revealed ? '' : ' hidden';

  const revealBtn = revealed
    ? ''
    : '<button class="btn-primary" onclick="doReveal()" id="revBtn">Reveal ▼</button>';
  const nextBtn = revealed
    ? '<button class="btn-primary" onclick="doNext()">' +
      (idx < total - 1 ? 'Next →' : 'Restart ↺') +
      '</button>'
    : '';
  const prevBtn = idx > 0
    ? '<button onclick="doPrev()">← Back</button>'
    : '';

  const shuffleClass = shuffleOn ? ' btn-active' : '';
  const controlRow =
    '<button class="btn-sm' + shuffleClass + '" onclick="toggleShuffle()">' +
    (shuffleOn ? '\u{1F500} Shuffle On' : '\u{1F500} Shuffle') +
    '</button>' +
    '<button class="btn-sm" onclick="doReset()">Reset</button>';

  app.innerHTML =
    '<div class="counter">Card ' + num + ' of ' + total + '</div>' +
    '<div class="card">' +
      cueHtml +
      '<div class="answer-zone' + hidden + '">' + answerHtml + '</div>' +
    '</div>' +
    '<div class="btn-row">' + prevBtn + revealBtn + nextBtn + '</div>' +
    '<div class="btn-row" style="margin-top:8px;">' + controlRow + '</div>';

  updateProgress();
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function doReveal() { revealed = true; render(); }

function doNext() {
  if (idx < ALL_CARDS.length - 1) {
    idx++;
    revealed = false;
    render();
  } else {
    // Restart
    resetOrder();
    render();
  }
}

function doPrev() {
  if (idx > 0) {
    idx--;
    revealed = true; // show previous card fully revealed
    render();
  }
}

function doReset() {
  resetOrder();
  render();
}

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  resetOrder();
  render();
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (!revealed) doReveal(); else doNext();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    doPrev();
  } else if (e.key === 's' || e.key === 'S') {
    toggleShuffle();
  }
});

// Init
resetOrder();
render();
</script>
</body>
</html>`;
}

export function lineBuddyFileName(actorName: string): string {
  return actorName.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") + "_line_buddy.html";
}

export function lineBuddyZipFileName(playTitle: string, cutName: string): string {
  const slug = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${slug(playTitle)}_${slug(cutName)}_line_buddy.zip`;
}
