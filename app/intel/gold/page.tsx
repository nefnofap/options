import { Suspense } from "react";
import { auth } from "@/auth";
import GoldView from "@/components/intel/views/GoldView";
import PremiumLock from "@/components/auth/PremiumLock";

export default async function Page() {
  const session = await auth();
  if (session?.user?.tier !== "premium") {
    return <PremiumLock title="Gold Engine" />;
  }
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <GoldView />
    </Suspense>
  );
}
