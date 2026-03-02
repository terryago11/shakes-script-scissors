"use client";

import type { Act, Scene } from "@/types/play";
import type { Actor } from "@/types/project";

interface Props {
  effectiveSceneOrder: string[];
  sceneById: Map<string, Scene>;
  sceneActMap: Map<string, Act>;
  actors: Actor[];
  actorSceneMatrix: Map<string, Map<string, { minutes: number; originalMinutes: number }>>;
  actorSceneLineMatrix: Map<string, Map<string, { original: number; afterCut: number }>>;
  pauses?: Record<string, { name: string; minutes: number }>;
  metric: "lines" | "words" | "time";
}

function fmtMinutes(m: number): string {
  if (m <= 0) return "";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function DashboardMatrix({
  effectiveSceneOrder,
  sceneById,
  sceneActMap,
  actors,
  actorSceneMatrix,
  actorSceneLineMatrix,
  pauses,
  metric,
}: Props) {
  if (actors.length === 0) {
    return (
      <p className="text-sm text-stone-400 py-4">
        No actors assigned yet. Add actors in Casting to see the matrix.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-stone-500 uppercase tracking-wider sticky left-0 bg-white min-w-40">
              Scene
            </th>
            {actors.map((actor) => (
              <th
                key={actor.id}
                className="py-2 px-2 text-xs font-semibold text-center min-w-24 max-w-32"
                style={{ color: actor.color }}
              >
                <div className="flex items-center justify-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: actor.color }}
                  />
                  <span className="truncate">{actor.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {effectiveSceneOrder.map((sceneId) => {
            const scene = sceneById.get(sceneId);
            const act = sceneActMap.get(sceneId);
            if (!scene || !act) return null;

            const pauseKey = `after:${sceneId}`;
            const pause = pauses?.[pauseKey];

            return (
              <>
                <tr key={sceneId} className="border-b border-stone-50 hover:bg-stone-50/50">
                  <td className="py-2 pr-4 sticky left-0 bg-white group-hover:bg-stone-50">
                    <div className="text-xs text-stone-400">{act.title}</div>
                    <div className="text-stone-700 font-medium truncate max-w-xs">{scene.title}</div>
                  </td>
                  {actors.map((actor) => {
                    const timeCell = actorSceneMatrix.get(actor.id)?.get(sceneId);
                    const lineCell = actorSceneLineMatrix.get(actor.id)?.get(sceneId);

                    let display = "";
                    let present = false;

                    if (metric === "time") {
                      const mins = timeCell?.minutes ?? 0;
                      present = mins > 0;
                      display = present ? fmtMinutes(mins) : "";
                    } else {
                      const val = lineCell?.afterCut ?? 0;
                      present = val > 0;
                      display = present ? val.toLocaleString() : "";
                    }

                    return (
                      <td
                        key={actor.id}
                        className="py-2 px-2 text-center"
                        title={
                          present && metric === "time" && timeCell
                            ? `${actor.name}: ${fmtMinutes(timeCell.minutes)} (orig: ${fmtMinutes(timeCell.originalMinutes)})`
                            : present && lineCell
                            ? `${actor.name}: ${lineCell.afterCut} / ${lineCell.original} lines`
                            : undefined
                        }
                      >
                        {present ? (
                          <span
                            className="text-xs tabular-nums font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: actor.color + "20",
                              color: actor.color,
                            }}
                          >
                            {display}
                          </span>
                        ) : (
                          <span className="text-stone-200 text-xs">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {pause && (
                  <tr key={`${sceneId}-pause`}>
                    <td
                      colSpan={actors.length + 1}
                      className="py-1.5 px-3"
                    >
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                        <span className="shrink-0">⏸</span>
                        <span className="font-medium">{pause.name}</span>
                        <span className="text-amber-500">{pause.minutes} min</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
