import type { CueScript, CueEntry } from "@/types/cut";

interface Props {
  cueScript: CueScript;
}

export default function CueScriptDocument({ cueScript }: Props) {
  const { actorName, playTitle, cutName, entries } = cueScript;

  return (
    <div className="font-serif max-w-2xl mx-auto px-8 py-10 print:px-6 print:py-4">
      {/* Header */}
      <div className="text-center mb-8 print:mb-6">
        <div className="text-2xl font-bold uppercase tracking-widest mb-1">{playTitle}</div>
        <div className="text-sm text-stone-500 mb-0.5">Cue Script</div>
        <div className="text-lg font-semibold">{actorName}</div>
        <div className="text-xs text-stone-400 mt-1">Cut: {cutName}</div>
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
      <div className="text-right pr-2 border-r-2 border-stone-300">
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
      <div className="text-sm italic text-stone-500 text-center">
        [{entry.text}]
      </div>
    );
  }

  // "lines" — the actor's own speech
  return (
    <div className="pl-2">
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
