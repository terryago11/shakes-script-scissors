"use client";

import { useState, useMemo } from "react";
import type { Project, CastOption } from "@/types/project";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";

type Metric = "words" | "lines" | "time";

interface Props {
  project: Project;
  play: Play;
  activeCut: Cut | null;
  lineCounts: LineCounts | null;
  stageTime: StageTimeResult | null;
  onClose: () => void;
}

type SortDir = "asc" | "desc";
type SortKey = "actor" | "col0" | "col1" | "col2";

interface ActorRow {
  name: string;
  cols: Array<{ chars: string[]; value: number } | null>;
}

function getActorStats(
  option: CastOption,
  actorId: string,
  metric: Metric,
  lineCounts: LineCounts | null,
  stageTime: StageTimeResult | null,
  activeCut: Cut | null,
  play: Play,
): { chars: string[]; value: number } | null {
  const charIds = (option.assignments ?? [])
    .filter((a) => a.actorId === actorId)
    .map((a) => a.characterId);
  if (charIds.length === 0) return null;
  const chars = [
    ...new Set(
      charIds.map(
        (id) =>
          activeCut?.characterAliases?.[id] ??
          play.castList.find((c) => c.id === id)?.name ??
          characterIdToName(id)
      )
    ),
  ];
  let value = 0;
  for (const id of charIds) {
    if (metric === "words") {
      value += lineCounts?.words?.byCharacter[id]?.afterCut ?? 0;
    } else if (metric === "lines") {
      value += lineCounts?.byCharacter[id]?.afterCut ?? 0;
    } else {
      value += stageTime?.byCharacter[id]?.minutes ?? 0;
    }
  }
  return { chars, value };
}

function formatValue(v: number, metric: Metric): string {
  if (metric === "time") return `${v.toFixed(1)} min`;
  return v.toLocaleString();
}

const NONE = "__none__";

const METRIC_LABELS: Record<Metric, string> = { words: "Words", lines: "Lines", time: "Time" };

export default function CompareCastOptions({ project, play, activeCut, lineCounts, stageTime, onClose }: Props) {
  const options = project.castOptions ?? [];
  const defaultFirst = project.activeCastOptionId
    ? Math.max(0, options.findIndex((o) => o.id === project.activeCastOptionId))
    : 0;

  const [cols, setCols] = useState<[string, string, string]>([
    options[defaultFirst]?.id ?? NONE,
    options[defaultFirst + 1]?.id ?? NONE,
    NONE,
  ]);
  const [metric, setMetric] = useState<Metric>("words");
  const [sortKey, setSortKey] = useState<SortKey>("actor");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const selectedOptions: Array<CastOption | null> = cols.map(
    (id) => (id === NONE ? null : (options.find((o) => o.id === id) ?? null))
  );
  const activeCols = selectedOptions.filter(Boolean) as CastOption[];

  const rows: ActorRow[] = project.actors.map((actor) => ({
    name: actor.name,
    cols: selectedOptions.map((opt) => {
      if (!opt) return null;
      return getActorStats(opt, actor.id, metric, lineCounts, stageTime, activeCut, play);
    }),
  }));

  // Max value per active column for bar scaling
  const colMaxValues = useMemo(
    () =>
      [0, 1, 2].map((ci) => {
        if (!selectedOptions[ci]) return 0;
        return Math.max(...rows.map((r) => r.cols[ci]?.value ?? 0), 1);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, metric]
  );

  function sortRows(r: ActorRow[]) {
    return [...r].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "actor") {
        cmp = a.name.localeCompare(b.name);
      } else {
        const colIdx = sortKey === "col0" ? 0 : sortKey === "col1" ? 1 : 2;
        const va = a.cols[colIdx]?.value ?? -1;
        const vb = b.cols[colIdx]?.value ?? -1;
        if (va === -1 && vb === -1) cmp = a.name.localeCompare(b.name);
        else if (va === -1) cmp = 1;
        else if (vb === -1) cmp = -1;
        else cmp = vb - va;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "actor" ? "asc" : "desc");
    }
  }

  const sorted = sortRows(rows);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex-1">Compare Cast Options</h2>
          {/* Metric toggle — amber style matching dashboard */}
          <div className="flex items-center gap-0 text-xs rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
            {(["words", "lines", "time"] as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 transition-colors ${
                  metric === m
                    ? "bg-amber-500 text-white font-medium"
                    : "text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                {METRIC_LABELS[m]}
                {m === "lines" && (
                  <span className="relative group/tip ml-0.5">
                    <span className="text-[9px] opacity-60 cursor-help border border-current rounded-full w-3 h-3 inline-flex items-center justify-center leading-none">?</span>
                    <span className="absolute bottom-full right-0 mb-1 hidden group-hover/tip:block w-52 bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-normal z-50 shadow-lg pointer-events-none font-normal normal-case tracking-normal">
                      Each kept line counts as 1. Partial lines (e.g. half-lines shared between characters) each count as 1 full line.
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Column pickers */}
        <div className="flex gap-3 px-5 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          {cols.map((colId, ci) => (
            <div key={ci} className="flex-1">
              <label className="block text-xs text-stone-400 dark:text-stone-500 mb-1">Column {ci + 1}</label>
              <select
                value={colId}
                onChange={(e) => {
                  const next = [...cols] as [string, string, string];
                  next[ci] = e.target.value;
                  setCols(next);
                }}
                className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value={NONE}>— none —</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order} · {o.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 px-5 py-3">
          {activeCols.length === 0 ? (
            <p className="text-stone-400 dark:text-stone-500 text-sm text-center py-8">
              Select at least one cast option above.
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th
                    className="sticky top-0 bg-white dark:bg-stone-900 text-left px-3 py-2 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider border-b border-stone-200 dark:border-stone-700 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 whitespace-nowrap"
                    onClick={() => handleHeaderClick("actor")}
                  >
                    Actor {sortKey === "actor" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  {selectedOptions.map((opt, ci) =>
                    opt ? (
                      <th
                        key={ci}
                        className="sticky top-0 bg-white dark:bg-stone-900 text-left px-3 py-2 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider border-b border-stone-200 dark:border-stone-700 cursor-pointer hover:text-stone-700 dark:hover:text-stone-200 whitespace-nowrap"
                        onClick={() => handleHeaderClick(`col${ci}` as SortKey)}
                      >
                        {opt.order} · {opt.name}
                        {project.activeCastOptionId === opt.id && " ✓"}
                        {" "}
                        {sortKey === `col${ci}` ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </th>
                    ) : null
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, ri) => (
                  <tr
                    key={row.name}
                    className={ri % 2 === 0 ? "bg-white dark:bg-stone-900" : "bg-stone-50 dark:bg-stone-800/50"}
                  >
                    <td className="px-3 py-2 font-medium text-stone-700 dark:text-stone-200 whitespace-nowrap">
                      {row.name}
                    </td>
                    {row.cols.map((cell, ci) =>
                      selectedOptions[ci] ? (
                        <td key={ci} className="px-3 py-2 text-stone-600 dark:text-stone-300 relative">
                          {cell ? (
                            <span className="relative z-10 flex flex-col gap-0.5">
                              <span>{cell.chars.join(", ")}</span>
                              <span className="flex items-center gap-1.5">
                                {/* Data bar */}
                                <span className="relative h-1.5 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden flex-1 max-w-[80px]">
                                  <span
                                    className="absolute inset-y-0 left-0 rounded-full bg-amber-400 dark:bg-amber-500"
                                    style={{ width: `${Math.min(100, (cell.value / colMaxValues[ci]) * 100)}%` }}
                                  />
                                </span>
                                <span className="text-stone-400 dark:text-stone-500 text-xs tabular-nums shrink-0">
                                  {formatValue(cell.value, metric)}
                                </span>
                              </span>
                            </span>
                          ) : (
                            <span className="text-stone-300 dark:text-stone-600 italic">—</span>
                          )}
                        </td>
                      ) : null
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
