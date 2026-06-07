import PaywallGate from "@/components/intel/PaywallGate";
import MatrixView from "@/components/intel/views/MatrixView";

export default function Page() {
  return (
    <PaywallGate title="Instrument Impact Matrix">
      <MatrixView />
    </PaywallGate>
  );
}
