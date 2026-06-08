import { Suspense } from "react";
import InstrumentsView from "@/components/intel/views/InstrumentsView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <InstrumentsView />
    </Suspense>
  );
}
