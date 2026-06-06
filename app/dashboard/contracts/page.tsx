import { Suspense } from "react";
import ContractsView from "@/components/dashboard/views/ContractsView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <ContractsView />
    </Suspense>
  );
}
