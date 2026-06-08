import { Suspense } from "react";
import BriefView from "@/components/intel/views/BriefView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <BriefView />
    </Suspense>
  );
}
