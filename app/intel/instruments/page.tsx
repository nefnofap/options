import { Suspense } from "react";
import { auth } from "@/auth";
import InstrumentsView from "@/components/intel/views/InstrumentsView";
import PremiumLock from "@/components/auth/PremiumLock";

export default async function Page() {
  const session = await auth();
  if (session?.user?.tier !== "premium") {
    return <PremiumLock title="Instruments" />;
  }
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <InstrumentsView />
    </Suspense>
  );
}
