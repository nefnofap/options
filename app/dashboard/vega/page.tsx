import { Suspense } from "react";
import MetricByStrikeView from "@/components/dashboard/views/MetricByStrikeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <MetricByStrikeView
        title="Vanna by strike"
        description="Vanna = ∂Δ/∂σ. Highlights where delta hedges flip with vol changes — useful around vol regimes."
        metric="netVanna"
      />
    </Suspense>
  );
}
