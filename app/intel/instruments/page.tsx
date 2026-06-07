import { Suspense } from "react";
import PaywallGate from "@/components/intel/PaywallGate";
import InstrumentsView from "@/components/intel/views/InstrumentsView";

export default function Page() {
  return (
    <PaywallGate title="Bullish / Bearish Instruments">
      <Suspense fallback={<div className="label-mono">loading</div>}>
        <InstrumentsView />
      </Suspense>
    </PaywallGate>
  );
}
