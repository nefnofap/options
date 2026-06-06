import { Suspense } from "react";
import MetricByStrikeView from "@/components/dashboard/views/MetricByStrikeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <MetricByStrikeView
        title="Vega exposure (VEX)"
        description="How much P&L flips per 1% change in implied volatility, by strike."
        metric="netVega"
      />
    </Suspense>
  );
}
