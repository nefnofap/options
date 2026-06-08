import { auth } from "@/auth";
import MatrixView from "@/components/intel/views/MatrixView";
import PremiumLock from "@/components/auth/PremiumLock";

export default async function Page() {
  const session = await auth();
  if (session?.user?.tier !== "premium") {
    return <PremiumLock title="Impact Matrix" />;
  }
  return <MatrixView />;
}
