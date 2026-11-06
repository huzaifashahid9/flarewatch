import { Suspense } from "react";
import ReportFromParams from "./ReportFromParams";

export default function ReportPage() {
  return (
    <Suspense fallback={<main className="p-10 text-neutral-700">Loading report…</main>}>
      <ReportFromParams />
    </Suspense>
  );
}
