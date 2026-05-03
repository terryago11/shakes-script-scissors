import type { CueScript, CueEntry } from "@/types/cut";

interface Props {
  cueScript: CueScript;
  characterNames?: string[];
  searchQuery?: string;
}

function buildSearchRegex(query: string | undefined): RegExp | undefined {
  if (!query || query.trim().length < 2) return undefined;
  return new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
}

/** Escape a string value for embedding in a CSS content: "..." property */
function escapeCssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Split text and wrap matches in <mark> spans for search highlighting. */
function HighlightedText({ text, regex }: { text: string; regex?: RegExp }) {
  if (!regex) return <>{text}</>;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-amber-200 dark:bg-amber-800 rounded-sm px-0.5">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function CueScriptDocument({ cueScript, characterNames = [], searchQuery }: Props) {
  const { actorName, playTitle, cutName, entries } = cueScript;
  const searchRegex = buildSearchRegex(searchQuery);

  const charList = characterNames.join(", ");
  const charDisplay = charList.length > 60 ? charList.slice(0, 58) + "…" : charList;

  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

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
          <CueEntryView key={i} entry={entry} searchRegex={searchRegex} />
        ))}
      </div>
    </div>
  );
}

function CueEntryView({ entry, searchRegex }: { entry: CueEntry; searchRegex?: RegExp }) {
  if (entry.type === "cue") {
    return (
      <div className="break-inside-avoid text-right pr-2 border-r-2 border-stone-300">
        {entry.cueSpeakerName && (
          <div className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-0.5">
            {entry.cueSpeakerName}
          </div>
        )}
        <div className="text-sm italic text-stone-500">
          <HighlightedText text={entry.text} regex={searchRegex} />
        </div>
      </div>
    );
  }

  if (entry.type === "stage") {
    return (
      <div className="break-inside-avoid text-sm italic text-stone-500 text-center">
        [<HighlightedText text={entry.text} regex={searchRegex} />]
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
      <div className={`text-base leading-relaxed ${entry.isSong ? "text-violet-700 dark:text-violet-400 italic" : "text-stone-900 dark:text-stone-100"}`}>
        {entry.text.split("\n").map((line, i) => (
          <div key={i}>
            <HighlightedText text={line} regex={searchRegex} />
          </div>
        ))}
      </div>
    </div>
  );
}
