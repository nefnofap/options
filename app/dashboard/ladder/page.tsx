import { Suspense } from "react";
import LadderView from "@/components/dashboard/views/LadderView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <LadderView />
    </Suspense>
  );
}
