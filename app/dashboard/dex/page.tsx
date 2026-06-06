import { Suspense } from "react";
import MetricByStrikeView from "@/components/dashboard/views/MetricByStrikeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <MetricByStrikeView
        title="Delta exposure (DEX)"
        description="Net delta across the chain by strike. Positive bars indicate dealer-long delta exposure; negative bars indicate net short."
        metric="netDelta"
      />
    </Suspense>
  );
}
