"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { crore, useFlareData } from "@/data";
import { GRADE_COLOR, gradeOf, worstSites } from "@/grade";
import { useT } from "@/i18n";
import type { SiteProps } from "@/lib-types";
import { MoneyCounter, Tracker2030 } from "./Counter";
import { GradeBadge, ProvinceRanking } from "./ReportCard";
import { BriefingCard } from "./SiteExtras";

const num = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default function Overview() {
  const t = useT();
  const router = useRouter();
  const { data, error } = useFlareData();
  useEffect(() => {
    // Old shared links were /?site=ID on the map; keep them working.
    const site = new URLSearchParams(window.location.search).get("site");
    if (site) router.replace(`/map?site=${encodeURIComponent(site)}`);
  }, [router]);
  const stats = useMemo(() => {
    if (!data) return null;
    const s = data.sites;
    const known = s.filter((x) => x.in_world_bank_catalogue).length;
    const fresh = s.filter((x) => x.activity_class === "new");
    const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    s.forEach((x) => { const g = gradeOf(x); if (g) grades[g.letter] += 1; });
    const months = data.meta.observed_months ?? [];
    const monthly = months.map((_, i) => s.reduce((sum, x) => sum + (x.monthly_nights?.[i] ?? 0), 0));
    const near = s.filter((x) => x.in_world_bank_catalogue && x.people_within_5km != null);
    const people = near.length ? near.reduce((sum, x) => sum + (x.people_within_5km ?? 0), 0) : null;
    return { known, fresh, grades, months, monthly, total: s.length, people };
  }, [data]);

  if (error) return <Empty text={t("No data yet. The nightly job has not produced a run for this deployment.")} />;
  if (!data || !stats) return <Empty text={t("Loading…")} />;
  const { meta, sites } = data;
  const tot = meta.totals;
  const homes = tot?.homes_powered?.mid ?? (tot ? (tot.power_mw.mid * 1000 * 8760) / 2400 : 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t("Pakistan flaring overview")}</h1>
          <p className="text-sm text-neutral-400">
            {t("Updated {d} PKT from nightly satellite passes.", { d: new Date(meta.generated_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) })}
          </p>
        </div>
        <Link href="/map" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
          {t("Open the live map")}
        </Link>
      </header>

      <BriefingCard />

      {tot && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi big label={t("Gas value burned per year")} value={t("Rs {n} crore", { n: num(crore(tot.value_usd_per_yr.mid)) })}
            sub={`$${compact(tot.value_usd_per_yr.low)}–$${compact(tot.value_usd_per_yr.high)}`} />
          <Kpi label={t("Homes that gas could power")} value={compact(homes)} />
          <Kpi label={t("t CO₂e / yr")} value={compact(tot.co2e_t_per_yr.mid)} />
          <Kpi label={t("MMSCFD gas")} value={String(tot.mmscfd.mid)} />
        </section>
      )}
      <section className={`grid grid-cols-2 gap-3 ${stats.people != null ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Kpi label={t("Known flares")} value={num(stats.known)} />
        <Kpi label={t("Hot spots watched")} value={num(stats.total)} />
        <Kpi label={t("new flares in the last 2 weeks")} value={num(stats.fresh.length)} accent={stats.fresh.length > 0} />
        <Kpi label={t("Worst grade (F) flares")} value={num(stats.grades.F)} />
        {stats.people != null && <Kpi label={t("People living within 5 km of a known flare")} value={compact(stats.people)} />}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title={t("Flare nights across Pakistan, by month")} className="lg:col-span-2">
          <MonthBars months={stats.months} values={stats.monthly} />
          <p className="mt-1 text-[11px] text-neutral-500">{t("Sum of nights each site was seen. Cloudy nights are missing, not zero.")}</p>
        </Card>
        <Card title={t("Report card grades")}>
          <GradeBars grades={stats.grades} />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title={t("Worst 5 flares")}>
          <WorstTable sites={sites} />
          <Link href="/flares" className="mt-2 block text-xs text-orange-300 underline">{t("See all flares")}</Link>
        </Card>
        <div>
          {meta.provinces ? <ProvinceRanking rows={meta.provinces} /> : (
            <Card title={t("Gas burned by province, per year")}>
              <p className="text-xs text-neutral-500">{t("Appears after the next nightly update.")}</p>
            </Card>
          )}
        </div>
        <div className="space-y-3">
          {tot && <MoneyCounter usdPerYear={tot.value_usd_per_yr.mid} />}
          <Tracker2030 meta={meta} />
          {stats.fresh.length > 0 && (
            <Card title={t("New flares in the last two weeks")}>
              {stats.fresh.map((s) => (
                <Link key={s.id} href={`/flares/${encodeURIComponent(s.id)}`} className="block text-sm text-cyan-200 underline">
                  {s.nearest_field?.name ?? s.id}
                </Link>
              ))}
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-neutral-400">{text}</div>;
}

function Kpi({ label, value, sub, big, accent }: { label: string; value: string; sub?: string; big?: boolean; accent?: boolean }) {
  const ring = big ? "bg-gradient-to-br from-orange-600/30 to-red-900/30 ring-orange-500/40"
    : accent ? "bg-cyan-900/30 ring-cyan-400/40" : "bg-neutral-900 ring-neutral-800";
  return (
    <div className={`rounded-xl p-4 ring-1 ${ring}`}>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`mt-1 font-bold text-white ${big ? "text-2xl" : "text-xl"}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-400" dir="ltr">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-neutral-900 p-4 ring-1 ring-neutral-800 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function MonthBars({ months, values }: { months: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 600, h = 150, gap = 4;
  const bw = (w - gap * (values.length - 1)) / Math.max(1, values.length);
  return (
    <div dir="ltr"><svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" role="img">
      {values.map((v, i) => (
        <g key={months[i]}>
          <rect x={i * (bw + gap)} y={h - (v / max) * h} width={bw} height={Math.max(1, (v / max) * h)} rx={3} fill="#ff7a1a">
            <title>{`${months[i]}: ${v}`}</title>
          </rect>
          <text x={i * (bw + gap) + bw / 2} y={h + 12} fontSize="10" fill="#a3a3a3" textAnchor="middle">
            {new Date(months[i] + "-01").toLocaleString("en-US", { month: "short" })}
          </text>
        </g>
      ))}
    </svg></div>
  );
}

function GradeBars({ grades }: { grades: Record<string, number> }) {
  const t = useT();
  const max = Math.max(1, ...Object.values(grades));
  return (
    <div className="space-y-2">
      {(["A", "B", "C", "D", "F"] as const).map((g) => (
        <div key={g} className="flex items-center gap-2" dir="ltr">
          <span className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-white" style={{ background: GRADE_COLOR[g] }}>{g}</span>
          <div className="h-3 flex-1 rounded bg-neutral-800">
            <div className="h-3 rounded" style={{ width: `${(grades[g] / max) * 100}%`, background: GRADE_COLOR[g] }} />
          </div>
          <span className="w-6 text-end text-sm text-neutral-300">{grades[g]}</span>
        </div>
      ))}
      <p className="text-[11px] text-neutral-500">{t("A is a small, rare flare. F is a large flare that burns almost every month.")}</p>
    </div>
  );
}

function WorstTable({ sites }: { sites: SiteProps[] }) {
  const t = useT();
  return (
    <div>
      {worstSites(sites).map(({ s, g }) => (
        <Link key={s.id} href={`/flares/${encodeURIComponent(s.id)}`}
          className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800">
          <GradeBadge g={g} />
          <span className="flex-1 truncate">{s.nearest_field?.name ?? (s.province ? t("A flare in {p}", { p: t(s.province) }) : s.id)}</span>
          {s.impact && <span className="text-xs text-orange-300">{t("Rs {n} crore", { n: Math.max(1, crore(s.impact.value_usd_per_yr.mid)) })}</span>}
        </Link>
      ))}
    </div>
  );
}
