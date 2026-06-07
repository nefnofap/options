import { Suspense } from "react";
import PaywallGate from "@/components/intel/PaywallGate";
import BriefView from "@/components/intel/views/BriefView";

export default function Page() {
  return (
    <PaywallGate title="Daily Pre-Market Brief">
      <Suspense fallback={<div className="label-mono">loading</div>}>
        <BriefView />
      </Suspense>
    </PaywallGate>
  );
}
