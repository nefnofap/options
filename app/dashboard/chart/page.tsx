import { Suspense } from "react";
import ChartView from "@/components/dashboard/views/ChartView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <ChartView />
    </Suspense>
  );
}
