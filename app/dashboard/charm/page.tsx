import { Suspense } from "react";
import MetricByStrikeView from "@/components/dashboard/views/MetricByStrikeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <MetricByStrikeView
        title="Charm by strike"
        description="Charm = -∂Δ/∂T. Delta decay per day. Drives the morning-of and afternoon dealer rehedge flows."
        metric="netCharm"
      />
    </Suspense>
  );
}
