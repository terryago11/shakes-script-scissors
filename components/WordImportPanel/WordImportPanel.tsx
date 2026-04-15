"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project/ProjectStore";
import { extractParagraphs } from "@/lib/import/DocxHighlightExtractor";
import {
  parseWordCuts,
  type WordImportResult,
  type WordImportError,
} from "@/lib/import/WordCutParser";
import type { Play } from "@/types/play";

interface Props {
  onCloseModal: () => void;
}

type ParseError =
  | WordImportError
  | { code: "PARSE_FAILED"; message: string };

type PanelState =
  | { phase: "consent" }
  | { phase: "upload" }
  | { phase: "parsing" }
  | { phase: "error"; error: ParseError }
  | { phase: "preview"; result: WordImportResult }
  | { phase: "done" };

export default function WordImportPanel({ onCloseModal }: Props) {
  const { project, dispatch } = useProject();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelState, setPanelState] = useState<PanelState>({ phase: "consent" });
  const [consentChecked, setConsentChecked] = useState(false);
  const [cutName, setCutName] = useState("Word import");

  async function handleFile(file: File) {
    if (!project) return;
    setPanelState({ phase: "parsing" });
    try {
      const [playRes, paragraphs] = await Promise.all([
        fetch(`/api/play/${project.playId}`).then((r) => {
          if (!r.ok) throw new Error("Could not load play data");
          return r.json() as Promise<Play>;
        }),
        extractParagraphs(file),
      ]);
      const result = parseWordCuts(paragraphs, playRes);
      if ("code" in result) {
        setPanelState({ phase: "error", error: result });
      } else {
        setPanelState({ phase: "preview", result });
      }
    } catch (e) {
      setPanelState({
        phase: "error",
        error: { code: "PARSE_FAILED", message: String(e) },
      });
    }
    // Reset file input so the same file can be re-uploaded after fixing issues
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCreate(result: WordImportResult) {
    if (!project) return;
    dispatch({
      type: "ADD_IMPORTED_CUT",
      name: cutName.trim() || "Word import",
      cutData: {
        cutMap: result.cutMap,
        lineCutMap: result.lineCutMap,
        speechEdits: result.speechEdits,
      },
    });
    setPanelState({ phase: "done" });
  }

  function handleViewScript() {
    onCloseModal();
    router.push(`/projects/${project?.id}`);
  }

  const sL = "block text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2";

  return (
    <div className="space-y-3">
      <label className={sL}>Import cuts from Word</label>

      {/* Step 1: Consent */}
      {panelState.phase === "consent" && (
        <div className="text-xs space-y-3">
          <div className="p-3 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg space-y-2.5">
            <p className="text-stone-700 dark:text-stone-200 font-medium">How this works</p>
            <p className="text-stone-600 dark:text-stone-300">
              Upload a Word (.docx) file where you have{" "}
              <strong>highlighted</strong> the text you want to cut. The app
              reads only the highlighting and creates a new draft.
            </p>

            <div>
              <p className="text-stone-500 dark:text-stone-400 font-medium mb-1">What is read:</p>
              <ul className="list-disc list-inside text-stone-500 dark:text-stone-400 space-y-0.5 ml-1">
                <li>Highlighted text → converted to cuts</li>
              </ul>
            </div>

            <div>
              <p className="text-stone-500 dark:text-stone-400 font-medium mb-1">What is ignored:</p>
              <ul className="list-disc list-inside text-stone-500 dark:text-stone-400 space-y-0.5 ml-1">
                <li>Stage directions (even if highlighted)</li>
                <li>Speaker names and headings</li>
                <li>New or inserted text</li>
                <li>Word&apos;s tracked changes (strikethrough, balloons)</li>
                <li>Any text that doesn&apos;t match this play&apos;s script</li>
              </ul>
            </div>

            <p className="text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Risk: Text from non-Folger editions may not match and will be
              skipped. Always review the summary after import.
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 accent-amber-500 shrink-0"
            />
            <span className="text-stone-600 dark:text-stone-300">
              I understand — only highlighted text will be imported as cuts
            </span>
          </label>

          {consentChecked && (
            <button
              onClick={() => setPanelState({ phase: "upload" })}
              className="w-full text-xs px-3 py-2 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              Continue →
            </button>
          )}
        </div>
      )}

      {/* Step 2: File picker */}
      {panelState.phase === "upload" && (
        <div className="text-xs space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-xs px-3 py-3 rounded border-2 border-dashed border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            ↑ Choose .docx file
          </button>
          <button
            onClick={() => setPanelState({ phase: "consent" })}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Parsing spinner */}
      {panelState.phase === "parsing" && (
        <p className="text-xs text-stone-400 dark:text-stone-500 py-3 text-center animate-pulse">
          Analysing document…
        </p>
      )}

      {/* Error */}
      {panelState.phase === "error" && (
        <div className="text-xs space-y-2">
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400 font-medium mb-1">
              Import failed
            </p>
            <p className="text-red-600 dark:text-red-400">
              {panelState.error.code === "NO_STRUCTURE" &&
                'No Act or Scene headings found. The document must have clear "Act I / Scene 1" style headings.'}
              {panelState.error.code === "LOW_MATCH" &&
                `Only ${Math.round((panelState.error as Extract<WordImportError, { code: "LOW_MATCH" }>).matchRate * 100)}% of speeches matched ${project?.playTitle ?? "this play"}'s text. Check that the document is for the right play.`}
              {panelState.error.code === "PARSE_FAILED" &&
                `Could not read the file: ${(panelState.error as { code: "PARSE_FAILED"; message: string }).message}`}
            </p>
          </div>
          <button
            onClick={() => setPanelState({ phase: "upload" })}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
          >
            ← Try another file
          </button>
        </div>
      )}

      {/* Preview */}
      {panelState.phase === "preview" && (
        <PreviewPanel
          result={panelState.result}
          playTitle={project?.playTitle}
          cutName={cutName}
          setCutName={setCutName}
          onBack={() => setPanelState({ phase: "upload" })}
          onCreate={() => handleCreate(panelState.result)}
        />
      )}

      {/* Done */}
      {panelState.phase === "done" && (
        <div className="text-xs space-y-2">
          <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-green-700 dark:text-green-400 font-medium">
              ✓ Cut created
            </p>
          </div>
          <button
            onClick={handleViewScript}
            className="w-full text-xs px-3 py-2 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            View in script →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Preview sub-component ----------

function PreviewPanel({
  result,
  playTitle,
  cutName,
  setCutName,
  onBack,
  onCreate,
}: {
  result: WordImportResult;
  playTitle?: string;
  cutName: string;
  setCutName: (v: string) => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const { stats, cutMap, lineCutMap, speechEdits } = result;
  const { matchRate } = stats;
  const isAmber = matchRate < 0.7;

  const fullyCut = Object.values(cutMap).filter((v) => v === "cut").length;
  const lineCuts = Object.values(lineCutMap ?? {}).filter((v) => v === "cut").length;
  const wordCutOps = Object.values(speechEdits ?? {}).reduce(
    (n, se) => n + se.ops.filter((op) => op.type === "cut").length,
    0
  );
  const speechesWithWordCuts = new Set(Object.keys(speechEdits ?? {})).size;

  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="text-xs space-y-3">
      {/* Match quality badge */}
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isAmber
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
        }`}
      >
        {isAmber ? "⚠" : "✓"} {Math.round(matchRate * 100)}% matched
        {playTitle ? ` to ${playTitle}` : ""}
      </span>

      {isAmber && (
        <p className="text-amber-600 dark:text-amber-400">
          Some speeches may use a different edition — review carefully.
        </p>
      )}

      {/* Summary */}
      <div className="space-y-1 text-stone-600 dark:text-stone-300">
        {fullyCut > 0 && (
          <p>
            • {fullyCut} speech{fullyCut !== 1 ? "es" : ""} fully cut
          </p>
        )}
        {lineCuts > 0 && (
          <p>
            • {lineCuts} line{lineCuts !== 1 ? "s" : ""} cut within speeches
          </p>
        )}
        {wordCutOps > 0 && (
          <p>
            • {wordCutOps} word-level cut{wordCutOps !== 1 ? "s" : ""} across{" "}
            {speechesWithWordCuts} speech
            {speechesWithWordCuts !== 1 ? "es" : ""}
          </p>
        )}
        {fullyCut === 0 && lineCuts === 0 && wordCutOps === 0 && (
          <p className="text-stone-400 dark:text-stone-500">
            No highlighted cuts detected.
          </p>
        )}
      </div>

      {/* Skipped highlights */}
      {stats.highlightedButUnmatched > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowSkipped((v) => !v)}
            className="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            {stats.highlightedButUnmatched} highlighted passage
            {stats.highlightedButUnmatched !== 1 ? "s" : ""} skipped (couldn&apos;t
            match) {showSkipped ? "▲" : "▼"}
          </button>
          {showSkipped && stats.skippedHighlights.length > 0 && (
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
              {stats.skippedHighlights.map((text, i) => (
                <p
                  key={i}
                  className="text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-800 px-2 py-1 rounded text-[10px] font-mono leading-relaxed"
                >
                  {text.slice(0, 160)}
                  {text.length > 160 ? "…" : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cut name */}
      <input
        type="text"
        value={cutName}
        onChange={(e) => setCutName(e.target.value)}
        placeholder="Draft name"
        className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded text-xs bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />

      <div className="flex gap-2">
        <button
          onClick={onCreate}
          className="flex-1 text-xs px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
        >
          Create cut
        </button>
        <button
          onClick={onBack}
          className="text-xs px-3 py-1.5 rounded border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
