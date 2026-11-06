"use client";

import { useEffect, useState } from "react";
import type { Meta } from "@/lib-types";
import { useT } from "@/i18n";

// Assumed exchange rate for display only; change here if it moves.
const PKR_PER_USD = 280;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

export function MoneyCounter({ usdPerYear }: { usdPerYear: number }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setSecs((Date.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, []);
  const pkr = (usdPerYear / SECONDS_PER_YEAR) * secs * PKR_PER_USD;
  const t = useT();
  return (
    <div className="mt-2 rounded-lg bg-black/40 p-2.5 ring-1 ring-red-500/30">
      <div className="text-[11px] text-neutral-400">{t("Since you opened this page, Pakistan has burned")}</div>
      <div className="font-mono text-2xl font-bold tabular-nums text-red-300">
        Rs {pkr.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
      </div>
      <div className="text-[10px] text-neutral-500">{t("of gas, at the known flares (Rs {r}/$ assumed)", { r: PKR_PER_USD })}</div>
    </div>
  );
}

/** World Bank yearly totals with the straight path to zero by 2030. */
export function Tracker2030({ meta }: { meta: Meta }) {
  const tr = useT();
  const t = meta.national_trend ?? [];
  if (t.length < 2) return null;
  const last = t[t.length - 1];
  const yearsLeft = 2030 - last.year;
  const cutPerYear = yearsLeft > 0 ? last.bcm / yearsLeft : last.bcm;
  const x0 = t[0].year, x1 = 2030, max = Math.max(...t.map((p) => p.bcm));
  const w = 280, h = 64;
  const X = (y: number) => ((y - x0) / (x1 - x0)) * w;
  const Y = (v: number) => h - (v / max) * (h - 4);
  const hist = t.map((p) => `${X(p.year)},${Y(p.bcm)}`).join(" ");
  return (
    <div className="mt-3 rounded-lg bg-neutral-900 p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-white">{tr("Road to zero routine flaring, 2030")}</span>
        <span className="text-[10px] text-neutral-500">{tr("World Bank, all flares")}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 12}`} className="mt-1 w-full" role="img" aria-label="Pakistan flaring trend and path to 2030">
        <polyline points={hist} fill="none" stroke="#ff7a1a" strokeWidth="2" />
        <line x1={X(last.year)} y1={Y(last.bcm)} x2={X(2030)} y2={Y(0)} stroke="#34d399" strokeWidth="2" strokeDasharray="4 3" />
        {[t[0].year, last.year, 2030].map((y) => (
          <text key={y} x={X(y)} y={h + 11} fontSize="8" fill="#a3a3a3"
            textAnchor={y === t[0].year ? "start" : y === 2030 ? "end" : "middle"}>{y}</text>
        ))}
      </svg>
      <p className="text-[11px] text-neutral-300">
        {tr("{y}: {b} BCM. To reach zero by 2030 Pakistan must cut about {c} million m³ a year, every year.",
          { y: last.year, b: last.bcm.toFixed(3), c: (cutPerYear * 1000).toFixed(0) })}
      </p>
      <p className="text-[10px] text-neutral-500">{tr("Pledge: OGDCL signed the OGDC Charter. World Bank totals include all flaring, not only routine.")}</p>
    </div>
  );
}
