import type { CueScript, CueEntry } from "@/types/cut";

interface Props {
  cueScript: CueScript;
  characterNames?: string[];
}

/** Escape a string value for embedding in a CSS content: "..." property */
function escapeCssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export default function CueScriptDocument({ cueScript, characterNames = [] }: Props) {
  const { actorName, playTitle, cutName, entries } = cueScript;

  // Build the characters string for the page header — truncate if long
  const charList = characterNames.join(", ");
  const charDisplay = charList.length > 60 ? charList.slice(0, 58) + "…" : charList;

  // Timestamp for the print footer
  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  // @page margin-box CSS — injected as a <style> block for print
  // All pages: footer with page number + date
  // All pages except first: header with play/actor/characters
  const pageCSS = `
@page {
  margin-top: 15mm;
  margin-bottom: 18mm;
  @top-left   { content: "${escapeCssString(playTitle)}  ·  ${escapeCssString(cutName)}"; font-family: Georgia, serif; font-size: 8pt; color: #666; }
  @top-right  { content: "${escapeCssString(actorName)}${charDisplay ? `  ·  ${escapeCssString(charDisplay)}` : ""}"; font-family: Georgia, serif; font-size: 8pt; color: #666; }
  @bottom-center { content: "Page " counter(page) "  ·  ${escapeCssString(printDate)}  ·  Generated with the Shakespeare Script Scissors tool"; font-family: Georgia, serif; font-size: 8pt; color: #999; }
}
@page :first {
  margin-top: 5mm;
  @top-left   { content: none; }
  @top-right  { content: none; }
  @bottom-center { content: none; }
}
@media print {
  body { background: white !important; }
}
`.trim();

  return (
    <div className="font-serif max-w-2xl mx-auto px-8 py-10 print:px-6 print:py-4 print:bg-white print:text-black">
      {/* Print-only @page styles */}
      <style dangerouslySetInnerHTML={{ __html: pageCSS }} />

      {/* Header */}
      <div className="text-center mb-8 print:mb-6">
        <div className="text-2xl font-bold uppercase tracking-widest mb-1">{playTitle}</div>
        <div className="text-sm text-stone-500 mb-0.5">Cue Script</div>
        <div className="text-lg font-semibold">{actorName}</div>
        <div className="text-xs text-stone-400 mt-1">Cut: {cutName}</div>
        {charDisplay && (
          <div className="text-xs text-stone-400 mt-0.5">{charDisplay}</div>
        )}
        <div className="border-t border-stone-300 mt-4 print:mt-2" />
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <CueEntryView key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function CueEntryView({ entry }: { entry: CueEntry }) {
  if (entry.type === "cue") {
    return (
      <div className="break-inside-avoid text-right pr-2 border-r-2 border-stone-300">
        {entry.cueSpeakerName && (
          <div className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-0.5">
            {entry.cueSpeakerName}
          </div>
        )}
        <div className="text-sm italic text-stone-500">{entry.text}</div>
      </div>
    );
  }

  if (entry.type === "stage") {
    return (
      <div className="break-inside-avoid text-sm italic text-stone-500 text-center">
        [{entry.text}]
      </div>
    );
  }

  // "lines" — the actor's own speech
  return (
    <div className="break-inside-avoid pl-2">
      {entry.characterName && (
        <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-0.5">
          {entry.characterName}
        </div>
      )}
      <div className="text-base text-stone-900 leading-relaxed">
        {entry.text.split("\n").map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
