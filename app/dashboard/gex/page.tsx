import { Suspense } from "react";
import GexView from "@/components/dashboard/views/GexView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <GexView />
    </Suspense>
  );
}
