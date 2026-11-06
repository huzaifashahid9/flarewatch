"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { crore, useFlareData } from "@/data";
import { GRADE_COLOR, gradeOf, type Grade } from "@/grade";
import { useT } from "@/i18n";
import type { SiteProps } from "@/lib-types";
import { GradeBadge } from "./ReportCard";

type Row = {
  name: string;
  sites: SiteProps[];
  usd: number;
  mmscfd: number;
  grades: Record<Grade["letter"], number>;
  avgPoints: number;
  better: number;
  worse: number;
};

/** Letter for a company: the grade of its average flare points. */
const letterFor = (p: number): Grade["letter"] => (p <= 1.5 ? "A" : p <= 2.5 ? "B" : p <= 3.5 ? "C" : p <= 4.5 ? "D" : "F");

export default function Companies() {
  const t = useT();
  const { data, error } = useFlareData();
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const by = new Map<string, Row>();
    for (const s of data?.sites ?? []) {
      const op = s.nearest_field?.operator;
      const g = gradeOf(s);
      if (!op || !g) continue;
      const r = by.get(op) ?? { name: op, sites: [], usd: 0, mmscfd: 0, grades: { A: 0, B: 0, C: 0, D: 0, F: 0 }, avgPoints: 0, better: 0, worse: 0 };
      r.sites.push(s);
      r.usd += s.impact?.value_usd_per_yr.mid ?? 0;
      r.mmscfd += s.volume?.mmscfd.mid ?? 0;
      r.grades[g.letter] += 1;
      r.avgPoints += g.points;
      if (s.trend?.direction === "improving") r.better += 1;
      if (s.trend?.direction === "worsening") r.worse += 1;
      by.set(op, r);
    }
    return [...by.values()].map((r) => ({ ...r, avgPoints: r.avgPoints / r.sites.length })).sort((a, b) => b.usd - a.usd);
  }, [data]);

  if (error) return <div className="p-10 text-neutral-400">{t("No data yet. The nightly job has not produced a run for this deployment.")}</div>;
  if (!data) return <div className="p-10 text-neutral-400">{t("Loading…")}</div>;
  const max = Math.max(1, ...rows.map((r) => r.usd));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">{t("Company scorecard")}</h1>
        <p className="text-sm text-neutral-400">
          {t("Flares grouped by the company that runs the nearest named field. Based on public sources, not the official licence map.")}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400">{t("Appears after the next nightly update.")}</p>
      ) : rows.map((r, i) => {
        const letter = letterFor(r.avgPoints);
        return (
          <div key={r.name} className="rounded-xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
            <button onClick={() => setOpen(open === r.name ? null : r.name)} className="flex w-full items-center gap-3 text-start">
              <span className="w-6 text-sm text-neutral-500">{i + 1}</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl font-bold text-white" style={{ background: GRADE_COLOR[letter] }}>{letter}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white">{r.name}</div>
                <div className="text-xs text-neutral-400">
                  {r.sites.length === 1 ? t("1 flare") : t("{n} flares", { n: r.sites.length })} · {r.mmscfd.toFixed(2)} MMSCFD
                  {r.better + r.worse > 0 && <> · <span className="text-emerald-400">{t("{n} better", { n: r.better })}</span>, <span className="text-red-400">{t("{n} worse", { n: r.worse })}</span></>}
                </div>
                <div className="mt-1.5 h-1.5 rounded bg-neutral-800">
                  <div className="h-1.5 rounded bg-orange-500" style={{ width: `${(r.usd / max) * 100}%` }} />
                </div>
              </div>
              <div className="text-end">
                <div className="font-semibold text-orange-300">{t("Rs {n} crore", { n: Math.max(1, crore(r.usd)) })}</div>
                <div className="text-[11px] text-neutral-500">{t("Loss per year")}</div>
              </div>
            </button>
            {open === r.name && (
              <div className="mt-3 border-t border-neutral-800 pt-2">
                {r.sites.sort((a, b) => (b.impact?.value_usd_per_yr.mid ?? 0) - (a.impact?.value_usd_per_yr.mid ?? 0)).map((s) => (
                  <Link key={s.id} href={`/flares/${encodeURIComponent(s.id)}`} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-neutral-800">
                    <GradeBadge g={gradeOf(s)!} />
                    <span className="flex-1 truncate text-neutral-200">{s.nearest_field?.name}</span>
                    <span className="text-xs text-orange-300">{t("Rs {n} crore", { n: Math.max(1, crore(s.impact?.value_usd_per_yr.mid ?? 0)) })}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-neutral-500">
        {t("Company grade is the average of its flares' report card points. A field's operator may share it with joint-venture partners.")}
      </p>
    </div>
  );
}
