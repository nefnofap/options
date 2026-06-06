import { Suspense } from "react";
import HeatmapView from "@/components/dashboard/views/HeatmapView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <HeatmapView />
    </Suspense>
  );
}
