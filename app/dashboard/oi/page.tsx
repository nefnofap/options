import { Suspense } from "react";
import OIView from "@/components/dashboard/views/OIView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <OIView />
    </Suspense>
  );
}
