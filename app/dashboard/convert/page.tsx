import { Suspense } from "react";
import ConvertView from "@/components/dashboard/views/ConvertView";

export default function Page() {
  return (
    <Suspense fallback={<div className="label-mono">loading</div>}>
      <ConvertView />
    </Suspense>
  );
}
