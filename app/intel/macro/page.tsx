import { Suspense } from "react";
import MacroView from "@/components/intel/views/MacroView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <MacroView />
    </Suspense>
  );
}
