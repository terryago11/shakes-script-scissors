"use client";

import { createContext, useContext, useState } from "react";

export type Metric = "lines" | "words";

interface MetricContextValue {
  metric: Metric;
  setMetric: (m: Metric) => void;
}

const MetricContext = createContext<MetricContextValue>({
  metric: "lines",
  setMetric: () => {},
});

export function MetricProvider({ children }: { children: React.ReactNode }) {
  const [metric, setMetric] = useState<Metric>("lines");
  return (
    <MetricContext.Provider value={{ metric, setMetric }}>
      {children}
    </MetricContext.Provider>
  );
}

export function useMetric() {
  return useContext(MetricContext);
}
