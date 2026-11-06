"use client";

import { useMemo, useState } from "react";
import type { Meta, SiteProps } from "@/lib-types";
import { useLang, useT } from "@/i18n";
import { GradeCard } from "./ReportCard";
import { DayNightCounts, FirePatternLine, PeopleLine } from "./SiteExtras";

const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Nights detected per month, as plain SVG bars. Cloudy months are not
 * zero flaring, so the caption says "nights seen", not "nights burning". */
export function MonthlyChart({ months, nights }: { months: string[]; nights: number[] }) {
  const max = Math.max(1, ...nights);
  const t = useT();
  const w = 288, h = 70, gap = 2;
  const bw = (w - gap * (months.length - 1)) / Math.max(1, months.length);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 14}`} className="w-full" role="img" aria-label="Nights seen per month">
        {nights.map((n, i) => {
          const bh = (n / max) * h;
          return (
            <g key={months[i]}>
              <rect x={i * (bw + gap)} y={h - bh} width={bw} height={Math.max(bh, n ? 2 : 1)}
                rx={1.5} fill={n ? "#ff7a1a" : "#404040"}>
                <title>{`${months[i]}: ${n} nights`}</title>
              </rect>
              {(i === 0 || i === months.length - 1 || months[i].endsWith("-01")) && (
                <text x={i === 0 ? 0 : i === months.length - 1 ? w : i * (bw + gap) + bw / 2} y={h + 11} fontSize="8" fill="#a3a3a3"
                  textAnchor={i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"}>
                  {new Date(months[i] + "-01").toLocaleString("en-US", { month: "short", year: "2-digit" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="text-[11px] text-neutral-500">
        {t("Nights seen by satellite each month (max {m}). Cloudy nights are missing, not zero.", { m: max })}
      </div>
    </div>
  );
}

type Option = {
  key: string;
  name: string;
  what: string;
  fits: (mmscfd: number) => boolean;
  fitNote: string;
  capex: (mmscfd: number, km: number) => number;
  netPerYear: (mmscfd: number, sellPrice: number, tariff: number) => number;
};

// Indicative screening figures, not vendor quotes. Every number here is a
// stated assumption the user can see; replace with quotes for a real study.
const POWER_BTU_PER_KWH = 9500; // gas engine, about 36% efficient
const POWER_CAPEX_PER_MW = 1.0e6;
const POWER_OPEX_PER_KWH = 0.015;
const CAPACITY_FACTOR = 0.85;
const CNG_CAPEX_PER_MMSCFD = 3.0e6;
const CNG_OPEX_PER_MMBTU = 3.0;
const PIPE_CAPEX_PER_KM = 0.6e6;
const PIPE_FIXED_CAPEX = 1.0e6;
const PIPE_OPEX_PER_MMBTU = 0.5;
const MMBTU_PER_MMSCF = 1000; // 1000 Btu/scf

const mmbtuPerYear = (mmscfd: number) => mmscfd * MMBTU_PER_MMSCF * 365;
const powerMw = (mmscfd: number) => (mmscfd * 1e6 * 1000) / POWER_BTU_PER_KWH / 24 / 1000;

const OPTIONS: Option[] = [
  {
    key: "power", name: "Power on site", what: "Gas engines turn the gas into electricity for the field or the grid.",
    fits: (q) => q >= 0.1 && q <= 5, fitNote: "best for 0.1 to 5 MMSCFD",
    capex: (q) => powerMw(q) * POWER_CAPEX_PER_MW,
    netPerYear: (q, _p, tariff) => powerMw(q) * 1000 * 8760 * CAPACITY_FACTOR * (tariff - POWER_OPEX_PER_KWH),
  },
  {
    key: "cng", name: "Compressed gas trucks", what: "Compress the gas (CNG) and truck it to a buyer. No pipeline needed.",
    fits: (q) => q >= 0.3 && q <= 10, fitNote: "best for 0.3 to 10 MMSCFD",
    capex: (q) => q * CNG_CAPEX_PER_MMSCFD,
    netPerYear: (q, price) => mmbtuPerYear(q) * (price - CNG_OPEX_PER_MMBTU),
  },
  {
    key: "pipe", name: "Pipeline tie-in", what: "Connect the flare to the nearest gas pipeline.",
    fits: (q) => q >= 1, fitNote: "best above 1 MMSCFD, when a pipeline is close",
    capex: (_q, km) => PIPE_FIXED_CAPEX + km * PIPE_CAPEX_PER_KM,
    netPerYear: (q, price) => mmbtuPerYear(q) * (price - PIPE_OPEX_PER_MMBTU),
  },
];

// Carbon credits for recovered gas: avoided flaring emissions, AM0009-style
// screening. Assumes 90% of the flared gas is captured.
const CAPTURE_SHARE = 0.9;

export function planOptions(q: number, sell: number, tariff: number, km: number,
                            co2eTPerYr: number, carbonUsdPerT: number) {
  const credits = co2eTPerYr * CAPTURE_SHARE * carbonUsdPerT;
  return OPTIONS.map((o) => {
    const capex = o.capex(q, km);
    const net = o.netPerYear(q, sell, tariff);
    const total = net + credits;
    return { o, capex, net, credits, payback: total > 0 ? capex / total : Infinity, fits: o.fits(q) };
  }).sort((a, b) => Number(b.fits) - Number(a.fits) || a.payback - b.payback);
}

export function RecoveryPlanner({ site, meta }: { site: SiteProps; meta: Meta }) {
  const v = site.volume!;
  const lng = meta.assumptions?.lng_price_usd_per_mmbtu ?? 18.4;
  const [sell, setSell] = useState(Math.round(lng * 0.5 * 10) / 10);
  const [tariff, setTariff] = useState(0.1);
  const [km, setKm] = useState(10);
  const [carbon, setCarbon] = useState(10);
  const q = v.mmscfd.mid;
  const co2 = site.impact?.co2e_t_per_yr.mid ?? 0;

  const rows = useMemo(() => planOptions(q, sell, tariff, km, co2, carbon), [q, km, sell, tariff, co2, carbon]);
  const best = rows.find((r) => r.fits && Number.isFinite(r.payback));
  const t = useT();

  return (
    <div className="mt-4">
      <h3 className="font-semibold text-white">{t("Recovery planner")}</h3>
      <p className="text-xs text-neutral-400">
        {t("{q} MMSCFD (range {a} to {b}). Change the inputs to test the case.",
          { q: q.toLocaleString("en-US", { maximumFractionDigits: 2 }), a: v.mmscfd.low.toFixed(2), b: v.mmscfd.high.toFixed(2) })}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-neutral-400">
        <label>{t("Gas price $/MMBtu")}
          <input type="number" step="0.5" min="0" value={sell} onChange={(e) => setSell(+e.target.value)}
            className="mt-0.5 w-full rounded bg-neutral-800 px-1.5 py-1 text-sm text-white" /></label>
        <label>{t("Power $/kWh")}
          <input type="number" step="0.01" min="0" value={tariff} onChange={(e) => setTariff(+e.target.value)}
            className="mt-0.5 w-full rounded bg-neutral-800 px-1.5 py-1 text-sm text-white" /></label>
        <label>{t("Pipeline km")}
          <input type="number" step="1" min="0" value={km} onChange={(e) => setKm(+e.target.value)}
            className="mt-0.5 w-full rounded bg-neutral-800 px-1.5 py-1 text-sm text-white" /></label>
        <label>{t("Carbon $/t")}
          <input type="number" step="1" min="0" value={carbon} onChange={(e) => setCarbon(+e.target.value)}
            className="mt-0.5 w-full rounded bg-neutral-800 px-1.5 py-1 text-sm text-white" /></label>
      </div>
      <div className="mt-3 space-y-2">
        {rows[0]?.credits > 0 && (
          <div className="rounded-lg bg-sky-900/30 p-2 text-xs text-sky-200 ring-1 ring-sky-500/40">
            {t("Carbon credits: about {m}/yr extra ({c} t CO₂e avoided at ${p}/t), included in every payback below.",
              { m: money(rows[0].credits), c: Math.round(co2 * CAPTURE_SHARE).toLocaleString("en-US"), p: carbon })}
          </div>
        )}
        {rows.map(({ o, capex, net, payback, fits }) => (
          <div key={o.key} className={`rounded-lg p-2.5 ring-1 ${best?.o.key === o.key ? "bg-emerald-900/30 ring-emerald-500/50" : "bg-neutral-900 ring-neutral-800"} ${fits ? "" : "opacity-50"}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-white">
                {t(o.name)}{best?.o.key === o.key && <span className="mx-1.5 rounded bg-emerald-500 px-1 text-[10px] text-black">{t("BEST FIT")}</span>}
              </span>
              <span className="text-sm text-white">
                {Number.isFinite(payback) ? t("{y} yr payback", { y: payback < 1 ? "<1" : payback.toFixed(1) }) : t("no payback")}
              </span>
            </div>
            <div className="text-xs text-neutral-400">{t(o.what)}</div>
            <div className="mt-1 text-xs text-neutral-300">
              {t("Build {c} · earns {n}/yr", { c: money(capex), n: money(net) })}
              {o.key === "power" && ` · ${t("{m} MW from engines", { m: powerMw(q).toFixed(1) })}`}
              {!fits && ` · ${t("size outside range ({r})", { r: t(o.fitNote) })}`}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-neutral-500">
        {t("Screening figures only: gas engines ${a}M/MW, CNG ${b}M per MMSCFD, pipeline ${c}M/km plus ${d}M. Replace with vendor quotes for a real study.",
          { a: POWER_CAPEX_PER_MW / 1e6, b: CNG_CAPEX_PER_MMSCFD / 1e6, c: PIPE_CAPEX_PER_KM / 1e6, d: PIPE_FIXED_CAPEX / 1e6 })}{" "}
        {t("Carbon credits assume 90% capture and a registered methodology (for example CDM AM0009 or an Article 6 deal); prices vary widely.")}{" "}
        {t("FlareWatch measures; selling gas needs a licensed buyer under Pakistan's rules.")}
      </p>
    </div>
  );
}

export default function SiteReport({ site, meta, onClose }: { site: SiteProps; meta: Meta; onClose: () => void }) {
  const months = meta.observed_months ?? [];
  const t = useT();
  const lang = useLang();
  const cls = site.activity_class.charAt(0).toUpperCase() + site.activity_class.slice(1);
  return (
    <aside dir={lang === "ur" ? "rtl" : "ltr"} className="absolute bottom-4 right-4 top-16 w-[22rem] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-neutral-950/90 p-4 text-sm text-neutral-200 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold capitalize text-white">{t(cls)} {t("site")}</h2>
          <div className="text-xs text-neutral-400" dir="ltr">{site.lat.toFixed(4)}, {site.lon.toFixed(4)} · {site.id}</div>
        </div>
        <button onClick={onClose} className="rounded px-2 text-lg text-neutral-400 hover:text-white" aria-label="Close">×</button>
      </div>
      <GradeCard site={site} />
      {(site.fire_pattern || site.people_within_5km != null) && (
        <div className="mt-3 space-y-0.5 text-xs">
          <FirePatternLine site={site} />
          {site.days_seen != null && <div className="text-neutral-500"><DayNightCounts site={site} /></div>}
          <PeopleLine site={site} className="text-neutral-300" />
        </div>
      )}
      {months.length > 0 && site.monthly_nights && (
        <div className="mt-3">
          <h3 className="mb-1 font-semibold text-white">{t("Activity over the last year")}</h3>
          <MonthlyChart months={months} nights={site.monthly_nights} />
        </div>
      )}
      <a href={`/report/${encodeURIComponent(site.id)}`} target="_blank" rel="noopener"
        className="mt-3 block rounded-md bg-white py-2 text-center text-sm font-semibold text-black hover:bg-neutral-200">
        {t("Open audit report (PDF)")}
      </a>
      <a href={`/flares/${encodeURIComponent(site.id)}`}
        className="mt-2 block rounded-md bg-neutral-800 py-2 text-center text-sm text-white hover:bg-neutral-700">
        {t("Open the full flare page")}
      </a>
      {site.volume ? (
        <RecoveryPlanner site={site} meta={meta} />
      ) : (
        <p className="mt-4 text-xs text-neutral-400">
          {t("No recovery plan: this site has no volume estimate yet, because it is not a known flare.")}
        </p>
      )}
    </aside>
  );
}
