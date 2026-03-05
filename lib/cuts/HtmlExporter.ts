import type { Play, Speech, StageDirection } from "@/types/play";
import type { Cut, Actor, ActorAssignment } from "@/types/project";
import { applyEditsToLine, segmentsToText } from "./applyEdits";
import { resolveCharacterName } from "@/lib/project/projectUtils";

// ---------------------------------------------------------------------------
// Pre-rendered data types (serialised into window.__SCRIPT__ in the HTML file)
// ---------------------------------------------------------------------------

interface UnitData {
  id: string;
  type: "speech" | "stage";
  characterId: string;
  characterName: string;
  /** "kept" = no changes; "cut" = removed entirely; "modified" = line/word edits */
  status: "kept" | "cut" | "modified";
  /** Lines after all cuts + word-level edits are applied (empty when fully cut) */
  keptLines: string[];
  /** Verbatim original lines from the play, no edits applied */
  originalLines: string[];
}

interface SceneData {
  id: string;
  actId: string;
  actTitle: string;
  sceneTitle: string;
  units: UnitData[];
}

interface CharacterData {
  id: string;
  name: string;
  actorName: string | null;
  actorColor: string | null;
  /** Total kept lines across all scenes */
  keptLineCount: number;
}

interface ScriptData {
  title: string;
  cutName: string;
  /** null when project name equals the play title */
  projectName: string | null;
  scenes: SceneData[];
  characters: CharacterData[];
  pauses: Record<string, { name: string; minutes: number }>;
}

// ---------------------------------------------------------------------------
// Pre-render helpers
// ---------------------------------------------------------------------------

function getUnitStatus(
  unit: Speech | StageDirection,
  cut: Cut
): "kept" | "cut" | "modified" {
  if (cut.cutMap[unit.id] === "cut") return "cut";
  if (unit.type === "stage") return "kept";
  const speech = unit as Speech;
  const lineCutMap = cut.lineCutMap ?? {};
  const speechEdits = cut.speechEdits ?? {};
  const hasLineCuts = speech.lines.some((l) => lineCutMap[l.id] === "cut");
  const hasWordEdits = ((speechEdits[speech.id] as { ops?: unknown[] } | undefined)?.ops?.length ?? 0) > 0;
  return hasLineCuts || hasWordEdits ? "modified" : "kept";
}

function buildScriptData(
  play: Play,
  cut: Cut,
  projectName?: string,
  actors?: Actor[],
  assignments?: ActorAssignment[]
): ScriptData {
  const aliases = cut.characterAliases ?? {};
  const reassignments = cut.speechReassignments ?? {};
  const lineCutMap = cut.lineCutMap ?? {};
  const speechEdits = cut.speechEdits ?? {};

  // Build scene order
  const allSceneIds = play.acts.flatMap((a) => a.scenes.map((s) => s.id));
  const effectiveOrder: string[] = cut.sceneOrder ?? allSceneIds;

  // Scene lookup
  const sceneMap = new Map<
    string,
    { actId: string; actTitle: string; sceneTitle: string; units: Play["acts"][0]["scenes"][0]["units"] }
  >();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, {
        actId: act.id,
        actTitle: act.title || `Act ${act.number}`,
        sceneTitle: scene.title || `Scene ${scene.number}`,
        units: scene.units,
      });
    }
  }

  // Accumulate kept line counts per character
  const charLineCount = new Map<string, number>();

  const scenes: SceneData[] = [];

  for (const sceneId of effectiveOrder) {
    const info = sceneMap.get(sceneId);
    if (!info) continue;

    const units: UnitData[] = [];

    for (const rawUnit of info.units) {
      const status = getUnitStatus(rawUnit as Speech | StageDirection, cut);

      if (rawUnit.type === "speech") {
        const speech = rawUnit as Speech;
        const effectiveCharId = reassignments[speech.id] ?? speech.characterId;
        const charName = resolveCharacterName(effectiveCharId, aliases, play.castList);

        const edit = speechEdits[speech.id] as { ops?: { lineId: string; type: string; start?: number; end?: number; offset?: number; text?: string }[] } | undefined;
        const ops = edit?.ops ?? [];

        const originalLines = speech.lines.map((l) => l.text);

        const keptLines =
          status === "cut"
            ? []
            : speech.lines
                .filter((l) => lineCutMap[l.id] !== "cut")
                .map((l) => {
                  const lineOps = ops.filter((op) => op.lineId === l.id);
                  if (lineOps.length === 0) return l.text;
                  const segments = applyEditsToLine(l.id, l.text, lineOps as Parameters<typeof applyEditsToLine>[2]);
                  return segmentsToText(segments);
                })
                .filter((t) => t.trim().length > 0);

        // Tally kept lines per character
        const prev = charLineCount.get(effectiveCharId) ?? 0;
        charLineCount.set(effectiveCharId, prev + keptLines.length);

        units.push({
          id: rawUnit.id,
          type: "speech",
          characterId: effectiveCharId,
          characterName: charName,
          status,
          keptLines,
          originalLines,
        });
      } else {
        const stage = rawUnit as StageDirection;
        const text = stage.text;
        units.push({
          id: rawUnit.id,
          type: "stage",
          characterId: "",
          characterName: "",
          status,
          keptLines: status === "cut" ? [] : [text],
          originalLines: [text],
        });
      }
    }

    scenes.push({
      id: sceneId,
      actId: info.actId,
      actTitle: info.actTitle,
      sceneTitle: info.sceneTitle,
      units,
    });
  }

  // Build characters list — all speaking characters in the play, sorted by kept lines desc
  const charSet = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          const effectiveCharId = reassignments[unit.id] ?? (unit as Speech).characterId;
          charSet.add(effectiveCharId);
        }
      }
    }
  }

  const characters: CharacterData[] = [...charSet]
    .map((charId) => {
      const assignment = assignments?.find((a) => a.characterId === charId);
      const actor = actors?.find((a) => a.id === assignment?.actorId);
      return {
        id: charId,
        name: resolveCharacterName(charId, aliases, play.castList),
        actorName: actor?.name ?? null,
        actorColor: actor?.color ?? null,
        keptLineCount: charLineCount.get(charId) ?? 0,
      };
    })
    .sort((a, b) => b.keptLineCount - a.keptLineCount);

  return {
    title: play.title,
    cutName: cut.name,
    projectName: projectName && projectName !== play.title ? projectName : null,
    scenes,
    characters,
    pauses: cut.pauses ?? {},
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML mini-app of the cut script.
 *
 * Features embedded in the output file (no server required):
 * - Three view modes: Clean (default) / Standard (strikethrough cuts) / Diff (side-by-side)
 * - Character filter sidebar — click to isolate one character's lines
 * - Sticky top bar with title, mode switcher, scene jump select, and print button
 * - Correct project name, character aliases, speech reassignments, scene order, pauses
 */
export function generateScriptHtml(
  play: Play,
  cut: Cut,
  projectName?: string,
  actors?: Actor[],
  assignments?: ActorAssignment[]
): string {
  const data = buildScriptData(play, cut, projectName, actors, assignments);
  const dataJson = JSON.stringify(data);

  const pageTitle = data.projectName
    ? `${data.projectName} — ${data.title} — ${data.cutName}`
    : `${data.title} — ${data.cutName}`;

  // ------------------------------------------------------------------
  // Inline CSS
  // ------------------------------------------------------------------
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.65;color:#1c1917;background:#fafaf9;overflow:hidden;height:100vh}
#app{display:flex;flex-direction:column;height:100vh}
#topbar{display:flex;align-items:center;gap:8px;padding:0 16px;height:44px;background:#fff;border-bottom:1px solid #e7e5e4;flex-shrink:0;white-space:nowrap;overflow:hidden}
#layout{display:flex;flex:1;overflow:hidden}
#script-col{flex:1;min-width:0;overflow-y:auto;padding:32px 48px 64px}
#char-panel{width:210px;flex-shrink:0;overflow-y:auto;border-left:1px solid #e7e5e4;background:#fafaf9;padding:10px 6px}
#title-area{display:flex;flex-direction:column;margin-right:8px;min-width:0;overflow:hidden;max-width:200px}
#play-title{font-size:13px;font-weight:600;color:#292524;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#project-sub{font-size:10px;color:#78716c;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mode-group{display:flex;gap:3px;flex-shrink:0}
.mode-btn{padding:3px 9px;border:1px solid #d6d3d1;border-radius:4px;background:#fff;font-size:12px;cursor:pointer;color:#57534e;font-family:Georgia,serif;transition:all .15s}
.mode-btn.active{background:#fbbf24;border-color:#f59e0b;color:#1c1917;font-weight:600}
#scene-jump{padding:3px 6px;border:1px solid #d6d3d1;border-radius:4px;font-size:12px;color:#57534e;background:#fff;font-family:Georgia,serif;cursor:pointer;max-width:140px;flex-shrink:0}
#print-btn{margin-left:auto;padding:4px 10px;background:#292524;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-family:Georgia,serif;flex-shrink:0}
#print-btn:hover{background:#1c1917}
.page-header{text-align:center;margin-bottom:40px;padding-bottom:20px;border-bottom:1px solid #d6d3d1}
.play-title-h{font-size:20px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.proj-name{font-size:12px;color:#78716c;margin-bottom:2px;font-style:italic}
.cut-label{font-size:11px;color:#a8a29e}
.act-header{font-size:14px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;margin:44px 0 6px;border-bottom:2px solid #292524;padding-bottom:5px}
.scene-header{font-size:12px;font-style:italic;color:#57534e;margin:18px 0 10px}
.speech{margin-bottom:14px}
.char-name{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#57534e;margin-bottom:2px}
.line-cut{text-decoration:line-through;color:#b91c1c;opacity:.65}
.stage-dir{text-align:center;font-style:italic;color:#78716c;font-size:13px;margin:8px 0}
.pause{text-align:center;border-top:1px dashed #d6d3d1;border-bottom:1px dashed #d6d3d1;padding:12px 0;margin:24px 0;font-size:13px;color:#78716c;font-style:italic}
.diff-row{display:flex;gap:0;border-left:3px solid #e7e5e4;margin-bottom:14px}
.diff-col{flex:1;min-width:0;padding:0 12px}
.diff-left{border-right:1px solid #e7e5e4}
.diff-right{color:#57534e}
.diff-label{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;margin-bottom:3px}
.panel-section{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#a8a29e;margin:14px 0 4px 4px}
.panel-char{display:block;width:100%;text-align:left;padding:3px 6px;border-radius:4px;border:none;background:none;font-size:12px;cursor:pointer;font-family:Georgia,serif;color:#44403c}
.panel-char:hover{background:#f0efee}
.panel-char.active{background:#fef9c3;color:#713f12;font-weight:600}
.panel-show-all{display:block;width:100%;text-align:left;padding:3px 6px;margin-bottom:6px;border-radius:4px;border:1px solid #d6d3d1;background:#fff;font-size:11px;cursor:pointer;font-family:Georgia,serif;color:#57534e}
.panel-count{font-size:10px;color:#a8a29e;margin-left:4px}
@media(max-width:700px){#char-panel{display:none}#script-col{padding:16px 20px}}
@media print{
  body{overflow:visible;height:auto}
  #app{display:block;height:auto}
  #layout{display:block}
  #topbar,#char-panel{display:none}
  #script-col{overflow:visible;padding:0;max-width:100%}
  .speech{break-inside:avoid}
  .act-header{break-after:avoid}
  .scene-header{break-after:avoid}
  .line-cut{text-decoration:line-through;opacity:.5}
  .diff-row{break-inside:avoid}
}
`.trim();

  // ------------------------------------------------------------------
  // Embedded JavaScript rendering engine
  // ------------------------------------------------------------------
  const js = `
(function(){
var D=window.__SCRIPT__;
var mode='clean';
var filterChar=null;

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function render(){
  var col=document.getElementById('script-col');
  var h=[];
  h.push('<div class="page-header">');
  h.push('<div class="play-title-h">'+esc(D.title)+'</div>');
  if(D.projectName)h.push('<div class="proj-name">'+esc(D.projectName)+'</div>');
  h.push('<div class="cut-label">Cut: '+esc(D.cutName)+'</div>');
  h.push('</div>');

  var lastAct=null;
  for(var i=0;i<D.scenes.length;i++){
    var sc=D.scenes[i];
    if(filterChar){
      var vis=false;
      for(var j=0;j<sc.units.length;j++){
        var u=sc.units[j];
        if(u.type==='speech'&&u.characterId===filterChar&&u.status!=='cut'){vis=true;break;}
      }
      if(!vis)continue;
    }
    if(sc.actId!==lastAct){
      lastAct=sc.actId;
      h.push('<div class="act-header">'+esc(sc.actTitle)+'</div>');
    }
    h.push('<div id="sc-'+sc.id.replace(/[^a-zA-Z0-9]/g,'_')+'" class="scene-header">'+esc(sc.sceneTitle)+'</div>');
    for(var j=0;j<sc.units.length;j++){
      var r=renderUnit(sc.units[j]);
      if(r)h.push(r);
    }
    var pause=D.pauses['after:'+sc.id];
    if(pause)h.push('<div class="pause">— '+esc(pause.name)+' ('+pause.minutes+' min) —</div>');
  }
  col.innerHTML=h.join('');
}

function renderUnit(u){
  if(u.type==='stage'){
    if(mode==='clean'&&u.status==='cut')return null;
    return '<div class="stage-dir">['+esc(u.keptLines[0]||'')+']</div>';
  }
  if(filterChar&&u.characterId!==filterChar)return null;
  if(mode==='clean'&&u.status==='cut')return null;
  var name='<div class="char-name">'+esc(u.characterName)+'</div>';
  if(mode==='diff'){
    var leftLines=u.keptLines.map(function(l){return'<div>'+esc(l)+'</div>';}).join('');
    var rightLines=u.originalLines.map(function(l){
      var cls=u.status==='cut'?' class="line-cut"':'';
      return'<div'+cls+'>'+esc(l)+'</div>';
    }).join('');
    var left=leftLines?'<div class="diff-label">Modified</div>'+name+leftLines:'<div class="diff-label">Modified</div><span style="color:#a8a29e;font-size:12px;font-style:italic">(cut)</span>';
    var right='<div class="diff-label">Original</div>'+name+rightLines;
    return'<div class="diff-row"><div class="diff-col diff-left">'+left+'</div><div class="diff-col diff-right">'+right+'</div></div>';
  }
  var lines;
  if(mode==='standard'&&u.status==='cut'){
    lines=u.originalLines.map(function(l){return'<div class="line-cut">'+esc(l)+'</div>';}).join('');
  }else{
    lines=u.keptLines.map(function(l){return'<div>'+esc(l)+'</div>';}).join('');
  }
  return'<div class="speech">'+name+lines+'</div>';
}

function renderPanel(){
  var panel=document.getElementById('char-panel');
  var h=[];
  if(filterChar){
    h.push('<button class="panel-show-all" onclick="SSS.clearFilter()">✕ Show all</button>');
  }
  var groups={},order=[];
  for(var i=0;i<D.characters.length;i++){
    var c=D.characters[i];
    if(c.keptLineCount===0)continue;
    var key=c.actorName||'\x00';
    if(!groups[key]){groups[key]=[];order.push(key);}
    groups[key].push(c);
  }
  for(var k=0;k<order.length;k++){
    var akey=order[k];
    var chs=groups[akey];
    if(akey!=='\x00'){
      var col=chs[0].actorColor||'#a8a29e';
      h.push('<div class="panel-section" style="color:'+col+'">'+esc(akey)+'</div>');
    } else if(order.length>1){
      h.push('<div class="panel-section">Unassigned</div>');
    }
    for(var m=0;m<chs.length;m++){
      var c2=chs[m];
      var act=c2.actorColor?' <span style="color:'+c2.actorColor+';font-size:10px">●</span> ':' ';
      var isAct=filterChar===c2.id;
      var eid=c2.id.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");
      h.push('<button class="panel-char'+(isAct?' active':'')+'" onclick="SSS.filterChar(\\''+eid+'\\')">'
        +act+esc(c2.name)+'<span class="panel-count">'+c2.keptLineCount+'</span></button>');
    }
  }
  panel.innerHTML=h.join('');
}

function populateJump(){
  var sel=document.getElementById('scene-jump');
  var lastAct=null,grp=null;
  for(var i=0;i<D.scenes.length;i++){
    var sc=D.scenes[i];
    if(sc.actId!==lastAct){
      lastAct=sc.actId;
      grp=document.createElement('optgroup');
      grp.label=sc.actTitle;
      sel.appendChild(grp);
    }
    var opt=document.createElement('option');
    opt.value=sc.id;
    opt.textContent=sc.sceneTitle;
    grp.appendChild(opt);
  }
  sel.addEventListener('change',function(){
    var el=document.getElementById('sc-'+sel.value.replace(/[^a-zA-Z0-9]/g,'_'));
    if(el){el.scrollIntoView({behavior:'smooth',block:'start'});}
    setTimeout(function(){sel.value='';},200);
  });
}

window.SSS={
  setMode:function(m){
    mode=m;
    document.querySelectorAll('.mode-btn').forEach(function(b){b.classList.toggle('active',b.dataset.mode===m);});
    render();
  },
  filterChar:function(id){
    filterChar=filterChar===id?null:id;
    render();renderPanel();
  },
  clearFilter:function(){
    filterChar=null;render();renderPanel();
  }
};

document.addEventListener('DOMContentLoaded',function(){
  render();renderPanel();populateJump();
});
})();
`.trim();

  // ------------------------------------------------------------------
  // HTML structure
  // ------------------------------------------------------------------
  const topbarTitle = data.projectName
    ? `<div id="play-title">${data.title}</div><div id="project-sub">${data.projectName}</div>`
    : `<div id="play-title">${data.title} — ${data.cutName}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
<style>${css}</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <div id="title-area">${topbarTitle}</div>
    <div id="mode-group">
      <button class="mode-btn active" data-mode="clean" onclick="SSS.setMode('clean')">Clean</button>
      <button class="mode-btn" data-mode="standard" onclick="SSS.setMode('standard')">Standard</button>
      <button class="mode-btn" data-mode="diff" onclick="SSS.setMode('diff')">Diff</button>
    </div>
    <select id="scene-jump"><option value="">Jump to scene…</option></select>
    <button id="print-btn" onclick="window.print()">Print</button>
  </div>
  <div id="layout">
    <div id="script-col"></div>
    <div id="char-panel"></div>
  </div>
</div>
<script>window.__SCRIPT__=${dataJson};</script>
<script>${js}</script>
</body>
</html>`;
}
