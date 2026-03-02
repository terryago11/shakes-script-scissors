"use client";

import { createContext, useContext, useState } from "react";

export type Metric = "lines" | "words" | "time";

interface MetricContextValue {
  metric: Metric;
  setMetric: (m: Metric) => void;
  wpm: number;
  setWpm: (wpm: number) => void;
}

const MetricContext = createContext<MetricContextValue>({
  metric: "lines",
  setMetric: () => {},
  wpm: 135,
  setWpm: () => {},
});

export function MetricProvider({ children }: { children: React.ReactNode }) {
  const [metric, setMetric] = useState<Metric>("lines");
  const [wpm, setWpm] = useState(135);
  return (
    <MetricContext.Provider value={{ metric, setMetric, wpm, setWpm }}>
      {children}
    </MetricContext.Provider>
  );
}

export function useMetric() {
  return useContext(MetricContext);
}
