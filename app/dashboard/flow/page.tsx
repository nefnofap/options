import { Suspense } from "react";
import FlowView from "@/components/dashboard/views/FlowView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <FlowView />
    </Suspense>
  );
}
