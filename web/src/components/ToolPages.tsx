"use client";

import { useRouter } from "next/navigation";
import { useFlareData } from "@/data";
import { useT } from "@/i18n";
import AnalystPanel from "./AnalystPanel";
import ReconcilePanel from "./ReconcilePanel";

export function CheckPage() {
  const t = useT();
  const router = useRouter();
  const { data, error } = useFlareData();
  if (error) return <div className="p-10 text-neutral-400">{t("No data yet. The nightly job has not produced a run for this deployment.")}</div>;
  if (!data) return <div className="p-10 text-neutral-400">{t("Loading…")}</div>;
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <ReconcilePanel inline sites={data.sites} onPick={(s) => router.push(`/flares/${encodeURIComponent(s.id)}`)} />
    </div>
  );
}

export function AskPage() {
  return (
    <div className="mx-auto h-full max-w-3xl p-4 md:p-6">
      <AnalystPanel inline />
    </div>
  );
}
