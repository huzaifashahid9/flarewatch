"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { crore, useFlareData } from "@/data";
import { gradeOf } from "@/grade";
import { useT } from "@/i18n";
import type { SiteProps } from "@/lib-types";
import { DownloadIcon } from "./Icons";
import { GradeBadge } from "./ReportCard";

type SortKey = "grade" | "name" | "province" | "nights" | "last" | "mmscfd" | "value";

const value = (s: SiteProps) => s.impact?.value_usd_per_yr.mid ?? 0;

function sortValue(s: SiteProps, k: SortKey): number | string {
  switch (k) {
    case "grade": return gradeOf(s)?.points ?? -1;
    case "name": return (s.nearest_field?.name ?? s.id).toLowerCase();
    case "province": return s.province ?? "";
    case "nights": return s.nights_detected;
    case "last": return s.last_seen;
    case "mmscfd": return s.volume?.mmscfd.mid ?? -1;
    case "value": return value(s);
  }
}

export default function FlaresTable() {
  const t = useT();
  const router = useRouter();
  const { data, error } = useFlareData();
  const [q, setQ] = useState("");
  const [province, setProvince] = useState("");
  const [grade, setGrade] = useState("");
  const [company, setCompany] = useState("");
  const [knownOnly, setKnownOnly] = useState(true);
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "value", desc: true });

  const provinces = useMemo(() => [...new Set((data?.sites ?? []).map((s) => s.province).filter(Boolean) as string[])].sort(), [data]);
  const companies = useMemo(() => [...new Set((data?.sites ?? []).map((s) => s.nearest_field?.operator).filter(Boolean) as string[])].sort(), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const out = data.sites.filter((s) => {
      if (knownOnly && !s.in_world_bank_catalogue) return false;
      if (province && s.province !== province) return false;
      if (grade && gradeOf(s)?.letter !== grade) return false;
      if (company && s.nearest_field?.operator !== company) return false;
      if (needle && !`${s.id} ${s.nearest_field?.name ?? ""} ${s.nearest_field?.operator ?? ""} ${s.province ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    out.sort((a, b) => {
      const x = sortValue(a, sort.k), y = sortValue(b, sort.k);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
    return out;
  }, [data, q, province, grade, company, knownOnly, sort]);

  const download = () => {
    const head = ["id", "lat", "lon", "grade", "nearest_field", "province", "activity_class", "nights_detected", "last_seen",
      "nearest_field_operator", "mmscfd_mid", "usd_per_yr_mid", "world_bank_trend", "world_bank_change_pct"];
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = rows.map((s) => [s.id, s.lat, s.lon, gradeOf(s)?.letter, s.nearest_field?.name, s.province, s.activity_class,
      s.nights_detected, s.last_seen, s.nearest_field?.operator, s.volume?.mmscfd.mid, s.impact?.value_usd_per_yr.mid, s.trend?.direction, s.trend?.change_pct].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flarewatch_flares.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <div className="p-10 text-neutral-400">{t("No data yet. The nightly job has not produced a run for this deployment.")}</div>;
  if (!data) return <div className="p-10 text-neutral-400">{t("Loading…")}</div>;

  const th = (k: SortKey, label: string, end?: boolean) => (
    <Th k={k} label={t(label)} end={end} sort={sort} onSort={(key) => setSort((x) => ({ k: key, desc: x.k === key ? !x.desc : true }))} />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t("All flares")}</h1>
          <p className="text-sm text-neutral-400">{t("{n} shown. Click a row for the full flare page.", { n: rows.length })}</p>
        </div>
        <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white hover:bg-neutral-700">
          <DownloadIcon className="h-4 w-4" />{t("Download CSV")}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search a field, company, province or id")}
          className="w-64 max-w-full rounded-lg bg-neutral-900 px-3 py-2 text-white ring-1 ring-neutral-800" />
        <select value={province} onChange={(e) => setProvince(e.target.value)} className="rounded-lg bg-neutral-900 px-3 py-2 ring-1 ring-neutral-800">
          <option value="">{t("All provinces")}</option>
          {provinces.map((p) => <option key={p} value={p}>{t(p)}</option>)}
        </select>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="rounded-lg bg-neutral-900 px-3 py-2 ring-1 ring-neutral-800">
          <option value="">{t("All grades")}</option>
          {["A", "B", "C", "D", "F"].map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {companies.length > 0 && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-lg bg-neutral-900 px-3 py-2 ring-1 ring-neutral-800">
            <option value="">{t("All companies")}</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-neutral-300">
          <input type="checkbox" checked={knownOnly} onChange={(e) => setKnownOnly(e.target.checked)} className="accent-orange-500" />
          {t("Known flares only")}
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-xs text-neutral-400">
            <tr>
              {th("grade", "Grade")}
              {th("name", "Flare")}
              {th("province", "Province")}
              {th("nights", "Nights seen", true)}
              {th("last", "Last seen")}
              {th("mmscfd", "MMSCFD", true)}
              {th("value", "Loss per year", true)}
              <th className="px-3 py-2 text-start font-medium">{t("Trend")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const g = gradeOf(s);
              return (
                <tr key={s.id} onClick={() => router.push(`/flares/${encodeURIComponent(s.id)}`)}
                  className="cursor-pointer border-t border-neutral-800 hover:bg-neutral-900">
                  <td className="px-3 py-2">{g ? <GradeBadge g={g} /> : <span className="text-neutral-600">–</span>}</td>
                  <td className="px-3 py-2">
                    <div className="text-white">{s.nearest_field?.name ?? t(s.in_world_bank_catalogue ? "Gas flare" : "Hot spot, not confirmed")}</div>
                    <div className="text-[11px] text-neutral-500">
                      {s.nearest_field?.operator && <span className="me-1.5 text-neutral-300">{s.nearest_field.operator} ·</span>}<span dir="ltr">{s.id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-neutral-300">{s.province ? t(s.province) : "–"}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{s.nights_detected}</td>
                  <td className="px-3 py-2 tabular-nums text-neutral-300" dir="ltr">{s.last_seen}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{s.volume ? s.volume.mmscfd.mid.toFixed(2) : "–"}</td>
                  <td className="px-3 py-2 text-end text-orange-300">{s.impact ? t("Rs {n} crore", { n: Math.max(1, crore(value(s))) }) : "–"}</td>
                  <td className="px-3 py-2 text-xs">
                    {s.trend ? <span className={s.trend.direction === "improving" ? "text-emerald-400" : s.trend.direction === "worsening" ? "text-red-400" : "text-neutral-400"}>
                      {t(s.trend.direction === "improving" ? "Better" : s.trend.direction === "worsening" ? "Worse" : "Same")} <span dir="ltr">({s.trend.change_pct > 0 ? "+" : ""}{s.trend.change_pct}%)</span>
                    </span> : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ k, label, end, sort, onSort }: {
  k: SortKey; label: string; end?: boolean; sort: { k: SortKey; desc: boolean }; onSort: (k: SortKey) => void;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${end ? "text-end" : "text-start"}`}>
      <button onClick={() => onSort(k)} className="hover:text-white">
        {label}{sort.k === k ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}
