import { Suspense } from "react";
import { auth } from "@/auth";
import BriefView from "@/components/intel/views/BriefView";
import PremiumLock from "@/components/auth/PremiumLock";

export default async function Page() {
  const session = await auth();
  if (session?.user?.tier !== "premium") {
    return <PremiumLock title="Pre-Market Brief" />;
  }
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <BriefView />
    </Suspense>
  );
}
