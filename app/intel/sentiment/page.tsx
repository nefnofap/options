import { Suspense } from "react";
import SentimentView from "@/components/intel/views/SentimentView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <SentimentView />
    </Suspense>
  );
}
