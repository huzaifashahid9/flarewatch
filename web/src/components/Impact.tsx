import type { Impact, Meta, Range, Totals } from "@/lib-types";

export type Dre = "official" | "measured";

const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = (n: number) => "$" + compact(n);
const span = (r: Range, f: (n: number) => string) => `${f(r.low)} to ${f(r.high)}`;

export function co2For(i: Impact, dre: Dre): Range {
  return dre === "official" ? i.co2e_t_per_yr : i.co2e_t_per_yr_at_observed_dre;
}

export function DreToggle({ dre, onChange, meta }: { dre: Dre; onChange: (d: Dre) => void; meta: Meta }) {
  const a = meta.assumptions;
  const pct = (x?: number) => (x ? `${Math.round(x * 1000) / 10}%` : "");
  return (
    <div className="mt-2 flex items-center gap-1 text-xs">
      <span className="text-neutral-400">Flares burn</span>
      {(["official", "measured"] as const).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`rounded px-2 py-0.5 ${dre === d ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"}`}
          title={d === "official" ? "Regulatory assumption" : "Measured in US fields (Plant et al. 2022)"}
        >
          {pct(d === "official" ? a?.dre_regulatory : a?.dre_observed)} {d}
        </button>
      ))}
    </div>
  );
}

export function Headline({ t, meta, dre }: { t: Totals; meta: Meta; dre: Dre }) {
  const co2 = co2For(t, dre);
  return (
    <div className="mt-3 rounded-lg bg-gradient-to-br from-orange-600/30 to-red-700/20 p-3 ring-1 ring-orange-500/30">
      <div className="text-xs uppercase tracking-wide text-orange-200/80">
        Burned every year at {t.sites_with_volume} known flares
      </div>
      <div className="mt-1 text-3xl font-bold text-white">{usd(t.value_usd_per_yr.mid)}</div>
      <div className="text-xs text-neutral-300">
        of gas ({span(t.value_usd_per_yr, usd)}) at ${meta.assumptions?.lng_price_usd_per_mmbtu}/MMBtu imported LNG
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Big value={`${t.mmscfd.mid}`} unit="MMSCFD gas" />
        <Big value={compact(co2.mid)} unit="t CO₂e / yr" />
        <Big value={`${Math.round(t.power_mw.mid)}`} unit="MW of power" />
      </div>
    </div>
  );
}

function Big({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="rounded-md bg-black/30 p-1.5">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-[10px] leading-tight text-neutral-400">{unit}</div>
    </div>
  );
}

export function SiteImpact({ i, dre }: { i: Impact; dre: Dre }) {
  const co2 = co2For(i, dre);
  return (
    <div className="mt-1 grid grid-cols-3 gap-1 text-center text-xs">
      <div><div className="font-semibold">{usd(i.value_usd_per_yr.mid)}</div><div className="text-neutral-600">gas value / yr</div></div>
      <div><div className="font-semibold">{compact(co2.mid)} t</div><div className="text-neutral-600">CO₂e / yr</div></div>
      <div><div className="font-semibold">{i.power_mw.mid} MW</div><div className="text-neutral-600">power</div></div>
    </div>
  );
}
