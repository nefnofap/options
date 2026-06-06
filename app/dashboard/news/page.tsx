import { Suspense } from "react";
import NewsView from "@/components/dashboard/views/NewsView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <NewsView />
    </Suspense>
  );
}
