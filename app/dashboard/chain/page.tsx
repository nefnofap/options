import { Suspense } from "react";
import ChainView from "@/components/dashboard/views/ChainView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <ChainView />
    </Suspense>
  );
}
