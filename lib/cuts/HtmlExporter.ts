import type { Play, Speech, StageDirection } from "@/types/play";
import type { Cut, Actor, ActorAssignment } from "@/types/project";
import { applyEditsToLine, segmentsToText } from "./applyEdits";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { expandSplits, expandInsertions, expandStageNotes, expandInsertedSDs } from "./expandUtils";
import { PART_LABELS } from "./SceneSubdivisionUtils";

// ---------------------------------------------------------------------------
// Pre-rendered data types (serialised into window.__SCRIPT__ in the HTML file)
// ---------------------------------------------------------------------------

interface UnitData {
  id: string;
  type: "speech" | "stage" | "subdivider";
  characterId: string;
  characterName: string;
  /** "kept" = no changes; "cut" = removed entirely; "modified" = line/word edits */
  status: "kept" | "cut" | "modified";
  /** Lines after all cuts + word-level edits are applied (empty when fully cut) */
  keptLines: string[];
  /** Verbatim original lines from the play, no edits applied */
  originalLines: string[];
  /** True when this SD's text has been overridden via sdTextEdits */
  isEdited?: boolean;
  /** True when this is a director-created SD from cut.insertedSDs */
  isInserted?: boolean;
  /** Part label for subdivider units (e.g. "B", "C") */
  subdividerLabel?: string;
  /** True when same speaker continues from the immediately preceding kept speech */
  isContinuation?: boolean;
  /** Part-indent char widths, parallel to keptLines (0 = no indent) */
  lineIndents?: number[];
  /** True when this speech has been reassigned to a different character */
  hasReassignment?: boolean;
  /** Pre-reassignment speaker name (only set when hasReassignment is true) */
  originalSpeaker?: string;
  /** True when this is a song speech or song SD */
  isSong?: boolean;
  /** True when this is a dance SD */
  isDance?: boolean;
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

    // Expand splits, insertions, inline stage notes, and inserted SDs for HTML export
    const expandedUnits = expandInsertedSDs(
      expandStageNotes(
        expandInsertions(
          expandSplits(info.units, cut.speechSplits),
          cut.insertions,
          play.castList
        )
      ),
      cut.insertedSDs
    );

    // Continuation detection — port of SceneBlock.tsx lines 145–207 (no showOriginal mode)
    const continuationIds = new Set<string>();
    {
      let lastSpeakerId: string | null = null;
      const insertionMap = cut.insertions ?? {};
      const splits = cut.speechSplits ?? {};

      const insAfterMap = new Map<string, Array<{ id: string; characterId: string }>>();
      for (const ins of Object.values(insertionMap)) {
        const arr = insAfterMap.get(ins.afterUnitId) ?? [];
        arr.push(ins as { id: string; characterId: string });
        insAfterMap.set(ins.afterUnitId, arr);
      }

      for (const rawUnit of expandedUnits) {
        if (rawUnit.type === "speech") {
          const unit = rawUnit as Speech;
          const isS2 = unit.id.endsWith(":s2");
          const isInsertionUnit = !!insertionMap[unit.id];

          if (!isS2 && !isInsertionUnit) {
            const reassigned = reassignments[unit.id];
            const charId = reassigned ? reassigned[0] : unit.characterId;
            const isAllSpeechUnit =
              /\bALL\b/i.test(unit.speakerTag) ||
              (unit.characterIds != null && unit.characterIds.length > 1) ||
              (reassigned != null && reassigned.length > 1);
            const isKept = cut.cutMap[unit.id] !== "cut";

            if (isKept) {
              if (!isAllSpeechUnit && lastSpeakerId === charId) continuationIds.add(unit.id);
              lastSpeakerId = isAllSpeechUnit ? null : charId;
            }

            const split = splits[unit.id];
            if (split && isKept) {
              const s2Id = `${unit.id}:s2`;
              const s2Reassigned = reassignments[s2Id];
              const s2CharId = s2Reassigned ? s2Reassigned[0] : (split.newCharacterId ?? unit.characterId);
              if (lastSpeakerId === s2CharId) continuationIds.add(s2Id);
              lastSpeakerId = s2CharId;
            }
          }
        }

        for (const ins of insAfterMap.get(rawUnit.id) ?? []) {
          if (lastSpeakerId === ins.characterId) continuationIds.add(ins.id);
          lastSpeakerId = ins.characterId;
        }
      }
    }

    // Build the set of split boundary unit IDs for this scene (empty if not subdivided)
    const sceneSplits = cut.sceneSubdivisions?.[sceneId] ?? [];
    const splitBoundaryIds = new Set(sceneSplits.map((s) => s.afterUnitId));
    let splitIdx = 0;

    for (const rawUnit of expandedUnits) {
      const status = getUnitStatus(rawUnit as Speech | StageDirection, cut);

      if (rawUnit.type === "speech") {
        const speech = rawUnit as Speech;
        // Resolve effective speakers (array) — may be multi-speaker
        const effectiveCharIds: string[] = reassignments[speech.id]
          ?? speech.characterIds
          ?? [speech.characterId];
        const primaryCharId = effectiveCharIds[0] ?? speech.characterId;
        // Build display name: "ALL" verbatim if speakerTag says ALL and no override, else join
        const isAllSpeech = /\bALL\b/i.test(speech.speakerTag) && !reassignments[speech.id];
        const charName = isAllSpeech
          ? speech.speakerTag.trim()
          : effectiveCharIds.map((id) => resolveCharacterName(id, aliases, play.castList)).join(" & ");

        const edit = speechEdits[speech.id] as { ops?: { lineId: string; type: string; start?: number; end?: number; offset?: number; text?: string }[] } | undefined;
        const ops = edit?.ops ?? [];

        // Insertions have no original — they didn't exist in the uncut play
        const isInsertion = !!(cut.insertions?.[speech.id]);
        const originalLines = isInsertion ? [] : speech.lines.map((l) => l.text);

        const keptLinePairs =
          status === "cut"
            ? []
            : speech.lines
                .filter((l) => lineCutMap[l.id] !== "cut")
                .map((l) => {
                  const lineOps = ops.filter((op) => op.lineId === l.id);
                  if (lineOps.length === 0) return { text: l.text, indent: l.partIndentChars ?? 0 };
                  const segments = applyEditsToLine(l.id, l.text, lineOps as Parameters<typeof applyEditsToLine>[2]);
                  return { text: segmentsToText(segments), indent: l.partIndentChars ?? 0 };
                })
                .filter(({ text }) => text.trim().length > 0);
        const keptLines = keptLinePairs.map((p) => p.text);
        const lineIndents = keptLinePairs.map((p) => p.indent);

        // Tally kept lines per effective speaker (each gets full count)
        for (const spkId of effectiveCharIds) {
          const prev = charLineCount.get(spkId) ?? 0;
          charLineCount.set(spkId, prev + keptLines.length);
        }

        const hasReassignment = !!(reassignments[speech.id]);
        const originalSpeaker: string | undefined = hasReassignment
          ? (isAllSpeech
              ? speech.speakerTag.trim()
              : (speech.characterIds ?? [speech.characterId])
                  .map((id) => resolveCharacterName(id, aliases, play.castList))
                  .join(" & "))
          : undefined;
        const isSongSpeech = (speech as Speech & { isSong?: boolean }).isSong === true
          || (cut.sdFlagOverrides?.[speech.id]?.isSong === true);

        units.push({
          id: rawUnit.id,
          type: "speech",
          characterId: primaryCharId,
          characterName: charName,
          status,
          keptLines,
          originalLines,
          isContinuation: continuationIds.has(rawUnit.id),
          lineIndents,
          hasReassignment,
          originalSpeaker,
          isSong: isSongSpeech,
          isDance: false,
        });
      } else {
        const stage = rawUnit as StageDirection;
        const text = cut.sdTextEdits?.[stage.id] ?? stage.text;
        const isEdited = !!(cut.sdTextEdits?.[stage.id]);
        const isInserted = !!(cut.insertedSDs?.[stage.id]);
        const isSongSD = (cut.sdFlagOverrides?.[stage.id]?.isSong ?? stage.isSong) === true;
        const isDanceSD = (cut.sdFlagOverrides?.[stage.id]?.isDance ?? stage.isDance) === true;
        units.push({
          id: rawUnit.id,
          type: "stage",
          characterId: "",
          characterName: "",
          status,
          keptLines: status === "cut" ? [] : [text],
          originalLines: [stage.text],
          isEdited,
          isInserted,
          isSong: isSongSD,
          isDance: isDanceSD,
        });
      }

      // Inject subdivider unit after a split boundary
      if (splitBoundaryIds.has(rawUnit.id)) {
        const nextLabel = PART_LABELS[splitIdx + 1] ?? String(splitIdx + 2);
        units.push({
          id: `${rawUnit.id}:subdiv`,
          type: "subdivider",
          characterId: "",
          characterName: "",
          status: "kept",
          keptLines: [],
          originalLines: [],
          subdividerLabel: nextLabel,
        });
        splitIdx++;
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

  // Build characters list — all effective speakers in the play, sorted by kept lines desc
  const charSet = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          const sp = unit as Speech;
          const ids: string[] = reassignments[sp.id] ?? sp.characterIds ?? [sp.characterId];
          for (const id of ids) charSet.add(id);
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
/** Escape a string value for embedding in a CSS content: "..." property */
function escapeCss(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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

  // @page margin boxes for print — strings baked in at export time
  const exportDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const pageTopLeft = data.projectName
    ? `${escapeCss(data.projectName)}  ·  ${escapeCss(data.cutName)}`
    : `${escapeCss(data.title)}  ·  ${escapeCss(data.cutName)}`;
  const pageTopRight = data.projectName ? escapeCss(data.title) : "";
  const pageCss = `@page{margin-top:15mm;margin-bottom:18mm;@top-left{content:"${pageTopLeft}";font-family:Georgia,serif;font-size:8pt;color:#666;}${pageTopRight ? `@top-right{content:"${pageTopRight}";font-family:Georgia,serif;font-size:8pt;color:#666;}` : ""}@bottom-center{content:"Page " counter(page) "  ·  Exported ${exportDate}  ·  Generated with the Shakespeare Script Scissors tool";font-family:Georgia,serif;font-size:8pt;color:#999;}}@page :first{margin-top:5mm;@top-left{content:none;}@top-right{content:none;}@bottom-center{content:none;}}`;

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
.stage-dir-edited{text-align:left;border-left:3px solid #4ade80;background:rgba(240,253,244,.5);padding-left:8px}
.stage-dir-edited::before{content:"edited";display:inline-block;font-size:9px;color:#16a34a;background:#dcfce7;border-radius:2px;padding:0 3px;margin-right:6px;font-style:normal;vertical-align:middle}
.pause{text-align:center;border-top:1px dashed #d6d3d1;border-bottom:1px dashed #d6d3d1;padding:12px 0;margin:24px 0;font-size:13px;color:#78716c;font-style:italic}
.sub-divider{display:flex;align-items:center;gap:8px;margin:20px 0;user-select:none}
.sub-divider-line{flex:1;height:1px;background:#fcd34d}
.sub-divider-label{font-size:11px;font-weight:bold;color:#b45309;padding:0 4px}
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
  body{overflow:visible;height:auto;background:white!important}
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
  if(u.type==='subdivider'){
    return '<div class="sub-divider"><div class="sub-divider-line"></div><span class="sub-divider-label">Part '+esc(u.subdividerLabel||'')+'</span><div class="sub-divider-line"></div></div>';
  }
  if(u.type==='stage'){
    if(u.status==='cut'){
      if(mode==='clean')return null;
      return '<div class="stage-dir" style="text-decoration:line-through;opacity:.5">['+esc(u.originalLines[0]||'')+']</div>';
    }
    var sdPrefix='';
    if(u.isSong)sdPrefix+='<span style="color:#7c3aed">♪ </span>';
    if(u.isDance)sdPrefix+='<span style="color:#0891b2">⊛ </span>';
    if(mode==='clean')return '<div class="stage-dir">'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>';
    if(u.isInserted&&mode==='standard'){
      return '<div class="stage-dir stage-dir-edited"><span style="font-size:9px;color:#16a34a;background:#dcfce7;border-radius:2px;padding:0 3px;margin-right:6px;font-style:normal;vertical-align:middle">inserted</span>'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>';
    }
    if(u.isEdited&&mode==='diff'){
      var left='<div class="diff-label">Modified</div><div class="stage-dir stage-dir-edited">'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>';
      var right='<div class="diff-label">Original</div><div class="stage-dir">'+sdPrefix+'['+esc(u.originalLines[0]||'')+']</div>';
      return'<div class="diff-row"><div class="diff-col diff-left">'+left+'</div><div class="diff-col diff-right">'+right+'</div></div>';
    }
    var sdCls=u.isEdited&&mode==='standard'?'stage-dir stage-dir-edited':'stage-dir';
    return '<div class="'+sdCls+'">'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>';
  }
  if(filterChar&&u.characterId!==filterChar)return null;
  if(mode==='clean'&&u.status==='cut')return null;
  var name;
  if(u.isContinuation){
    if(mode==='clean'){name='';}
    else{name='<div class="char-name" style="font-style:italic;font-weight:normal">(cont.)</div>';}
  }else if(u.hasReassignment&&mode==='standard'){
    var origSpan='<span style="text-decoration:line-through;color:#b91c1c">'+esc(u.originalSpeaker||'')+'</span>';
    var newSpan='<span style="color:#16a34a">'+esc(u.characterName)+'</span>';
    name='<div class="char-name">'+origSpan+' '+newSpan+'</div>';
  }else{
    var songPfx=u.isSong?'<span style="color:#7c3aed;font-size:11px">♪ </span>':'';
    name='<div class="char-name">'+songPfx+esc(u.characterName)+'</div>';
  }
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
    lines=u.keptLines.map(function(l,i){
      var ind=u.lineIndents&&u.lineIndents[i]?'padding-left:'+u.lineIndents[i]+'ch':'';
      var sty='';
      if(ind)sty+=ind+';';
      if(u.isSong)sty+='color:#7c3aed;font-style:italic;';
      if(sty)sty=sty.replace(/;$/,'');
      return sty?'<div style="'+sty+'">'+esc(l)+'</div>':'<div>'+esc(l)+'</div>';
    }).join('');
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
<style>${css}${pageCss}</style>
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
