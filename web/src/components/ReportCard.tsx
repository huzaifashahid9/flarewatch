"use client";

import type { ProvinceRow, SiteProps } from "@/lib-types";
import { GRADE_COLOR, gradeOf, worstSites, type Grade } from "@/grade";
import { useT } from "@/i18n";

const PKR_PER_USD = 280;
const crore = (usd: number) => Math.round((usd * PKR_PER_USD) / 1e7);

export function GradeBadge({ g, big }: { g: Grade; big?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white ${big ? "h-10 w-10 text-2xl" : "h-6 w-6 text-sm"}`}
      style={{ background: GRADE_COLOR[g.letter] }} dir="ltr">
      {g.letter}
    </span>
  );
}

export function TrendLine({ site, className = "" }: { site: SiteProps; className?: string }) {
  const t = useT();
  const tr = site.trend;
  if (!tr) return null;
  const vars = { p: Math.abs(tr.change_pct), a: tr.from_year, b: tr.to_year };
  const text = tr.direction === "improving" ? t("Getting better: down {p}% from {a} to {b} (World Bank)", vars)
    : tr.direction === "worsening" ? t("Getting worse: up {p}% from {a} to {b} (World Bank)", vars)
    : t("About the same from {a} to {b} (World Bank)", vars);
  const color = tr.direction === "improving" ? "text-emerald-600" : tr.direction === "worsening" ? "text-red-600" : "text-neutral-500";
  return <div className={`${color} ${className}`}>{tr.direction === "improving" ? "↓ " : tr.direction === "worsening" ? "↑ " : "→ "}{text}</div>;
}

/** Grade with its reasons, for the site report. */
export function GradeCard({ site }: { site: SiteProps }) {
  const t = useT();
  const g = gradeOf(site);
  if (!g) return null;
  return (
    <div className="mt-3 rounded-lg bg-neutral-900 p-3">
      <div className="flex items-center gap-3">
        <GradeBadge g={g} big />
        <div>
          <div className="font-semibold text-white">{t("Flare report card")}</div>
          <div className="text-xs text-neutral-400">{t("A is a small, rare flare. F is a large flare that burns almost every month.")}</div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-neutral-300">
        <li>{t("Size: {n} of 4 points", { n: g.size })}</li>
        <li>{t("How often it burns: {n} of 2 points", { n: g.burn })}</li>
        {g.trend !== 0 && <li>{t(g.trend > 0 ? "Trend: +1, getting worse" : "Trend: -1, getting better")}</li>}
      </ul>
      <TrendLine site={site} className="mt-2 text-xs" />
      {site.baseline_history && site.baseline_history.length > 1 && <History rows={site.baseline_history} />}
    </div>
  );
}

function History({ rows }: { rows: [number, number][] }) {
  const t = useT();
  const max = Math.max(...rows.map((r) => r[1]), 1e-9);
  const w = 280, h = 44, gap = 2, bw = (w - gap * (rows.length - 1)) / rows.length;
  return (
    <div className="mt-2" dir="ltr">
      <svg viewBox={`0 0 ${w} ${h + 12}`} className="w-full" role="img" aria-label={t("World Bank yearly volume for this flare")}>
        {rows.map(([y, v], i) => (
          <g key={y}>
            <rect x={i * (bw + gap)} y={h - (v / max) * h} width={bw} height={Math.max(1, (v / max) * h)} rx={1.5} fill="#ff7a1a">
              <title>{`${y}: ${v} BCM`}</title>
            </rect>
            {(i === 0 || i === rows.length - 1) && (
              <text x={i === 0 ? 0 : w} y={h + 10} fontSize="8" fill="#a3a3a3" textAnchor={i === 0 ? "start" : "end"}>{y}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="text-[11px] text-neutral-500">{t("World Bank yearly volume for this flare")}</div>
    </div>
  );
}

export function WorstList({ sites, onPick }: { sites: SiteProps[]; onPick: (s: SiteProps) => void }) {
  const t = useT();
  const rows = worstSites(sites);
  if (!rows.length) return null;
  return (
    <div className="rounded-xl bg-neutral-900 p-3">
      <div className="mb-2 text-sm font-semibold text-white">{t("Worst 5 flares")}</div>
      {rows.map(({ s, g }) => (
        <button key={s.id} onClick={() => onPick(s)}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-start text-sm text-neutral-200 hover:bg-neutral-800">
          <GradeBadge g={g} />
          <span className="flex-1 truncate">{s.nearest_field?.name ?? (s.province ? t("A flare in {p}", { p: t(s.province) }) : s.id)}</span>
          {s.impact && <span className="text-xs text-orange-300">{t("Rs {n} crore", { n: Math.max(1, crore(s.impact.value_usd_per_yr.mid)) })}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProvinceRanking({ rows }: { rows: ProvinceRow[] }) {
  const t = useT();
  const shown = rows.filter((r) => r.name !== "Unknown" && r.sites > 0);
  if (!shown.length) return null;
  const max = Math.max(...shown.map((r) => r.value_usd_per_yr), 1);
  return (
    <div className="rounded-xl bg-neutral-900 p-3">
      <div className="mb-2 text-sm font-semibold text-white">{t("Gas burned by province, per year")}</div>
      {shown.map((r) => (
        <div key={r.name} className="py-1">
          <div className="flex justify-between text-xs text-neutral-300">
            <span>{t(r.name)}</span>
            <span>{r.value_usd_per_yr > 0 ? t("Rs {n} crore", { n: crore(r.value_usd_per_yr) }) : t(r.sites === 1 ? "1 hot spot, no known flares" : "{n} hot spots, no known flares", { n: r.sites })}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded bg-neutral-800">
            <div className="h-1.5 rounded bg-orange-500" style={{ width: `${(r.value_usd_per_yr / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
