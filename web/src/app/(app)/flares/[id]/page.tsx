import { Suspense } from "react";
import DetailFromParams from "./DetailFromParams";

export default function FlarePage() {
  return (
    <Suspense fallback={<div className="p-10 text-neutral-400">Loading…</div>}>
      <DetailFromParams />
    </Suspense>
  );
}
