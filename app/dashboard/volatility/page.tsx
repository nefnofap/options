import { Suspense } from "react";
import VolatilityView from "@/components/dashboard/views/VolatilityView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <VolatilityView />
    </Suspense>
  );
}
