import type { CueScript, CueEntry } from "@/types/cut";
import type { Actor } from "@/types/project";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SceneBlock {
  sceneId: string;
  actId: string;
  sceneTitle: string;
  actTitle: string;
  items: CueEntry[];
}

/** Group flat CueEntry list into scene blocks, preserving order. */
function buildScenes(entries: CueScript["entries"]): SceneBlock[] {
  const scenes: SceneBlock[] = [];
  const sceneIndex = new Map<string, number>();

  for (const entry of entries) {
    const sceneId = entry.sceneId ?? "__default__";
    if (!sceneIndex.has(sceneId)) {
      sceneIndex.set(sceneId, scenes.length);
      scenes.push({
        sceneId,
        actId: entry.actId ?? "",
        sceneTitle: entry.sceneTitle ?? "Scene",
        actTitle: entry.actTitle ?? "",
        items: [],
      });
    }
    scenes[sceneIndex.get(sceneId)!].items.push(entry);
  }

  // Drop scenes with no lines items (actor not present)
  return scenes.filter((s) => s.items.some((i) => i.type === "lines"));
}

export function exportLineBuddy(cueScript: CueScript, actor: Actor): string {
  const scenes = buildScenes(cueScript.entries);
  const sceneData = JSON.stringify(
    scenes.map((s) => ({
      sceneId: s.sceneId,
      actId: s.actId,
      sceneTitle: s.sceneTitle,
      actTitle: s.actTitle,
      items: s.items.map((e) => ({
        type: e.type,
        text: e.text,
        characterName: e.characterName,
        cueSpeaker: e.cueSpeakerName,
        isSong: e.isSong ?? false,
        isDance: e.isDance ?? false,
      })),
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
    min-height: 100%;
    padding: 0;
  }

  /* ── Sticky header ──────────────────────────────────────────── */
  header {
    width: 100%;
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
    padding: 8px 16px;
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header-top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .header-title { font-size: 14px; font-weight: bold; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .header-sub { font-size: 11px; color: var(--muted); font-style: italic; white-space: nowrap; }
  .header-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .scene-select {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--stone-light);
    color: var(--text);
    font-family: inherit;
    cursor: pointer;
  }
  .btn-nav {
    min-height: 32px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--card-bg);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    transition: background .15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-nav:hover { background: var(--stone-light); }
  .btn-nav:disabled { opacity: .35; cursor: default; }

  /* ── Scene content ──────────────────────────────────────────── */
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 16px;
  }

  .scene-header {
    font-size: 11px;
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .progress-label {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 10px;
    text-align: right;
  }

  /* ── Entry blocks ───────────────────────────────────────────── */
  .entry { margin-bottom: 10px; }

  /* Cue */
  .cue-zone {
    border-left: 3px solid var(--amber);
    padding: 6px 10px;
    font-style: italic;
    color: var(--muted);
  }
  .cue-speaker {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--amber);
    display: block;
    margin-bottom: 2px;
    font-style: normal;
  }
  .cue-text { font-size: 15px; }
  .cue-opening { color: var(--muted); font-size: 13px; font-style: normal; }

  /* Lines — hidden until revealed */
  .lines-block {
    background: var(--reveal-bg);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .lines-block.hidden { visibility: hidden; }
  .speech-name {
    font-size: 10px;
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
  .speech-text.song-text { color: #7c3aed; font-style: italic; }

  /* Stage direction */
  .stage-dir {
    font-size: 13px;
    font-style: italic;
    color: var(--muted);
    padding-left: 10px;
  }

  /* ── Bottom reveal button ───────────────────────────────────── */
  .reveal-bar {
    position: sticky;
    bottom: 0;
    background: var(--card-bg);
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    justify-content: center;
    gap: 10px;
    z-index: 8;
  }
  button.btn-primary {
    min-height: 44px;
    padding: 8px 28px;
    border-radius: 8px;
    border: none;
    background: var(--amber);
    color: #fff;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    font-family: inherit;
    transition: opacity .15s;
    -webkit-tap-highlight-color: transparent;
  }
  button.btn-primary:hover { opacity: .9; }
  button.btn-primary:active { opacity: .75; }
  button.btn-secondary {
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
  button.btn-secondary:hover { background: var(--stone-light); }

  .empty {
    text-align: center;
    color: var(--muted);
    font-style: italic;
    padding: 60px 20px;
  }

  @media (max-width: 400px) {
    main { padding: 10px; }
    .speech-text { font-size: 15px; }
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="header-title">${title}</div>
    <span class="header-sub">${subtitle}</span>
  </div>
  <div class="header-nav">
    <button class="btn-nav" id="btnPrev" onclick="prevScene()" title="Previous scene ([)" disabled>&#8592;</button>
    <select class="scene-select" id="sceneJump" onchange="jumpScene(this.value)" title="Jump to scene (g)"></select>
    <button class="btn-nav" id="btnNext" onclick="nextScene()" title="Next scene (])" disabled>&#8594;</button>
  </div>
</header>

<main id="app">
  <div class="empty">Loading&#8230;</div>
</main>

<div class="reveal-bar" id="revealBar">
  <button class="btn-primary" id="btnReveal" onclick="advance()">Reveal &#9660;</button>
</div>

<script>
const ALL_SCENES = ${sceneData};

let sceneIdx = 0;
let revealIdx = -1; // index into current scene's lines-type items revealed so far (-1 = none)

function linesItems(scene) {
  return scene.items.reduce(function(acc, item, i) {
    if (item.type === 'lines') acc.push(i);
    return acc;
  }, []);
}

function updateNavButtons() {
  var s = ALL_SCENES;
  document.getElementById('btnPrev').disabled = sceneIdx === 0;
  document.getElementById('btnNext').disabled = sceneIdx === s.length - 1;
}

function buildSceneSelect() {
  var sel = document.getElementById('sceneJump');
  sel.innerHTML = '';
  ALL_SCENES.forEach(function(s, i) {
    var opt = document.createElement('option');
    opt.value = i;
    var label = s.actTitle ? s.actTitle + ' · ' + s.sceneTitle : s.sceneTitle;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  sel.value = sceneIdx;
}

function render() {
  if (ALL_SCENES.length === 0) {
    document.getElementById('app').innerHTML = '<div class="empty">No lines found for this actor.</div>';
    document.getElementById('revealBar').style.display = 'none';
    return;
  }

  var scene = ALL_SCENES[sceneIdx];
  var lineIdxs = linesItems(scene);
  var allRevealed = revealIdx >= lineIdxs.length - 1;

  // Scene heading
  var heading = scene.actTitle ? scene.actTitle + ' · ' + scene.sceneTitle : scene.sceneTitle;
  var progress = lineIdxs.length > 0
    ? '<div class="progress-label">' + (allRevealed ? lineIdxs.length : revealIdx + 1) + ' / ' + lineIdxs.length + ' lines</div>'
    : '';

  // Build item HTML
  var itemsHtml = '';
  var lineItemCounter = 0;
  for (var i = 0; i < scene.items.length; i++) {
    var item = scene.items[i];
    if (item.type === 'cue') {
      var spk = item.cueSpeaker
        ? '<span class="cue-speaker">' + esc(item.cueSpeaker) + '</span>'
        : '';
      var txt = item.text
        ? '<span class="cue-text">…' + esc(item.text) + '</span>'
        : '<span class="cue-opening">— Beginning —</span>';
      itemsHtml += '<div class="entry"><div class="cue-zone">' + spk + txt + '</div></div>';
    } else if (item.type === 'lines') {
      var revealed = lineItemCounter <= revealIdx;
      var hiddenClass = revealed ? '' : ' hidden';
      var nameHtml = item.characterName
        ? '<div class="speech-name">' + esc(item.characterName) + '</div>'
        : '';
      var songClass = item.isSong ? ' song-text' : '';
      var textHtml = '<div class="speech-text' + songClass + '">' + esc(item.text).replace(/\\n/g, '<br>') + '</div>';
      itemsHtml += '<div class="entry" data-line-idx="' + lineItemCounter + '"><div class="lines-block' + hiddenClass + '">' + nameHtml + textHtml + '</div></div>';
      lineItemCounter++;
    } else if (item.type === 'stage') {
      var sdPrefix = '';
      if (item.isSong) sdPrefix = '<span style="color:#7c3aed">&#9834; </span>';
      if (item.isDance) sdPrefix = '<span style="color:#0891b2">&#8859; </span>';
      itemsHtml += '<div class="entry"><div class="stage-dir">[' + sdPrefix + esc(item.text) + ']</div></div>';
    }
  }

  document.getElementById('app').innerHTML =
    '<div class="scene-header">' + esc(heading) + '</div>' +
    progress +
    itemsHtml;

  // Update reveal button
  var bar = document.getElementById('revealBar');
  var btn = document.getElementById('btnReveal');
  if (lineIdxs.length === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    if (allRevealed) {
      btn.textContent = sceneIdx < ALL_SCENES.length - 1 ? 'Next Scene →' : 'Done ✓';
    } else {
      btn.textContent = 'Reveal ▼';
    }
  }

  document.getElementById('sceneJump').value = sceneIdx;
  updateNavButtons();

  // Scroll newly revealed line into view
  if (revealIdx >= 0 && !allRevealed) {
    var el = document.querySelector('[data-line-idx="' + revealIdx + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function advance() {
  var scene = ALL_SCENES[sceneIdx];
  var lineIdxs = linesItems(scene);
  if (revealIdx < lineIdxs.length - 1) {
    revealIdx++;
    render();
  } else {
    // All lines revealed — advance to next scene
    nextScene();
  }
}

function goBack() {
  if (revealIdx >= 0) {
    revealIdx--;
    render();
  } else if (sceneIdx > 0) {
    sceneIdx--;
    var scene = ALL_SCENES[sceneIdx];
    revealIdx = linesItems(scene).length - 1;
    render();
  }
}

function nextScene() {
  if (sceneIdx < ALL_SCENES.length - 1) {
    sceneIdx++;
    revealIdx = -1;
    render();
  }
}

function prevScene() {
  if (sceneIdx > 0) {
    sceneIdx--;
    revealIdx = -1;
    render();
  }
}

function jumpScene(val) {
  var idx = parseInt(val, 10);
  if (!isNaN(idx) && idx >= 0 && idx < ALL_SCENES.length) {
    sceneIdx = idx;
    revealIdx = -1;
    render();
  }
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('keydown', function(e) {
  var tag = (e.target || {}).tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    advance();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goBack();
  } else if (e.key === ']') {
    e.preventDefault();
    nextScene();
  } else if (e.key === '[') {
    e.preventDefault();
    prevScene();
  } else if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    document.getElementById('sceneJump').focus();
  }
});

// Init
buildSceneSelect();
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
