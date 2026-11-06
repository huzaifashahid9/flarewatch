"use client";

import { useEffect, useState } from "react";
import type { Meta, SiteProps } from "@/lib-types";
import { MonthlyChart, planOptions } from "./SiteReport";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const num = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export default function AuditReport({ id }: { id: string }) {
  const [site, setSite] = useState<SiteProps | null | undefined>(undefined);
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    Promise.all([fetch("/data/sites.geojson").then((r) => r.json()), fetch("/data/meta.json").then((r) => r.json())])
      .then(([g, m]) => {
        setMeta(m);
        const f = (g.features as { properties: SiteProps }[]).find((x) => x.properties.id === id);
        setSite(f ? f.properties : null);
      })
      .catch(() => setSite(null));
  }, [id]);

  if (site === undefined) return <main className="p-10 text-neutral-700">Loading report…</main>;
  if (!site || !meta) return <main className="p-10 text-neutral-700">No site with id {id}.</main>;

  const v = site.volume, i = site.impact, a = meta.assumptions;
  const generated = new Date(meta.generated_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" });
  const plan = v && i ? planOptions(v.mmscfd.mid, (a?.lng_price_usd_per_mmbtu ?? 18.4) * 0.5, 0.1, 10, i.co2e_t_per_yr.mid, 10) : [];
  const best = plan.find((p) => p.fits && Number.isFinite(p.payback));

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-neutral-900 print:p-0">
      <div className="flex items-start justify-between border-b-2 border-orange-500 pb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-orange-600">FlareWatch · Independent satellite audit</div>
          <h1 className="text-2xl font-bold">Flare site report: {site.id}</h1>
          <div className="text-neutral-600">
            {site.lat.toFixed(4)}° N, {site.lon.toFixed(4)}° E ·{" "}
            <a className="text-orange-700 underline" href={`https://www.google.com/maps/@${site.lat},${site.lon},2000m/data=!3m1!1e3`}>view on satellite map</a>
          </div>
        </div>
        <button onClick={() => window.print()} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white print:hidden">
          Save as PDF
        </button>
      </div>

      <section className="mt-4 grid grid-cols-4 gap-3">
        {[
          ["Status", site.activity_class],
          ["Nights seen", num(site.nights_detected)],
          ["Last seen", site.last_seen],
          ["Known flare", site.in_world_bank_catalogue ? `Yes (WB ${site.baseline_year})` : "No"],
        ].map(([k, val]) => (
          <div key={k} className="rounded border border-neutral-200 p-2">
            <div className="text-[11px] uppercase text-neutral-500">{k}</div>
            <div className="font-semibold capitalize">{val}</div>
          </div>
        ))}
      </section>

      <section className="mt-5">
        <h2 className="text-base font-bold">1. Findings</h2>
        {v && i ? (
          <table className="mt-2 w-full border-collapse text-left">
            <thead><tr className="border-b border-neutral-300 text-[11px] uppercase text-neutral-500">
              <th className="py-1">Measure</th><th>Best estimate</th><th>Range</th></tr></thead>
            <tbody>
              <tr className="border-b border-neutral-100"><td className="py-1">Gas flared</td><td>{v.mmscfd.mid.toFixed(2)} MMSCFD</td><td>{v.mmscfd.low.toFixed(2)} to {v.mmscfd.high.toFixed(2)}</td></tr>
              <tr className="border-b border-neutral-100"><td className="py-1">Volume</td><td>{(v.bcm_per_yr.mid * 1000).toFixed(1)} million m³/yr</td><td>{(v.bcm_per_yr.low * 1000).toFixed(1)} to {(v.bcm_per_yr.high * 1000).toFixed(1)}</td></tr>
              <tr className="border-b border-neutral-100"><td className="py-1">Gas value (imported LNG price)</td><td>{usd(i.value_usd_per_yr.mid)}/yr</td><td>{usd(i.value_usd_per_yr.low)} to {usd(i.value_usd_per_yr.high)}</td></tr>
              <tr className="border-b border-neutral-100"><td className="py-1">CO₂e at 98% burn efficiency</td><td>{num(i.co2e_t_per_yr.mid)} t/yr</td><td>{num(i.co2e_t_per_yr.low)} to {num(i.co2e_t_per_yr.high)}</td></tr>
              <tr className="border-b border-neutral-100"><td className="py-1">CO₂e at 91.1% (measured in field studies)</td><td>{num(i.co2e_t_per_yr_at_observed_dre.mid)} t/yr</td><td>{num(i.co2e_t_per_yr_at_observed_dre.low)} to {num(i.co2e_t_per_yr_at_observed_dre.high)}</td></tr>
              <tr><td className="py-1">Power the gas could make</td><td>{i.power_mw.mid} MW</td><td>{i.power_mw.low} to {i.power_mw.high}</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="mt-1">This site is a persistent heat source but is not in the World Bank flare catalogue, so no volume is estimated. It may be an unlisted flare or an industrial source (cement, steel, brick). Recommended: field verification.</p>
        )}
      </section>

      {meta.observed_months && site.monthly_nights && (
        <section className="mt-5">
          <h2 className="text-base font-bold">2. Activity over the last year</h2>
          <div className="mt-2 max-w-md rounded bg-neutral-900 p-3"><MonthlyChart months={meta.observed_months} nights={site.monthly_nights} /></div>
        </section>
      )}

      {best && (
        <section className="mt-5">
          <h2 className="text-base font-bold">3. Recommended recovery option</h2>
          <p className="mt-1"><b>{best.o.name}</b>: {best.o.what} Build about {usd(best.capex)}, earning {usd(best.net)}/yr from gas or power plus {usd(best.credits)}/yr from carbon credits. Payback about <b>{best.payback.toFixed(1)} years</b>.</p>
          <ul className="mt-1 list-disc pl-5 text-neutral-700">
            {plan.filter((p) => p !== best).map((p) => (
              <li key={p.o.key}>{p.o.name}: build {usd(p.capex)}, payback {Number.isFinite(p.payback) ? `${p.payback.toFixed(1)} yr` : "none"}{p.fits ? "" : " (size outside its usual range)"}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-neutral-500">Screening figures, not vendor quotes. Gas sold at half the imported LNG price, power at $0.10/kWh, 10 km pipeline, carbon at $10/t with 90% capture.</p>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-base font-bold">4. Method and data</h2>
        <ul className="mt-1 list-disc pl-5 text-neutral-700">
          <li>Detections: NASA FIRMS VIIRS NOAA-20 and NOAA-21 night-time hotspots, clipped to Pakistan, grouped within 500 m. Cloudy nights count as missing, not as zero.</li>
          <li>Volume: World Bank Global Gas Flaring Reduction per-flare estimate ({site.baseline_year ?? "n/a"}), band −8% / +29%.</li>
          <li>Emissions: 2.27 t CO₂ plus 0.30 t CO₂e methane slip per 1,000 m³ at 98% efficiency, scaled for 91.1%. Methane GWP100 = 29.8.</li>
          <li>Value: ${a?.lng_price_usd_per_mmbtu}/MMBtu ({a?.lng_price_source}), 1,000 Btu/scf.</li>
          <li>Data as of {generated} PKT. Satellites see heat, not ownership: operator attribution needs licence-block data.</li>
        </ul>
      </section>

      <footer className="mt-6 border-t border-neutral-200 pt-2 text-[11px] text-neutral-500">
        FlareWatch by Team Hexabytes (FAST-NUCES Karachi). Independent screening audit, not a regulatory determination.
        Sources: NASA FIRMS (LANCE), World Bank GGFR. flarewatch-chi.vercel.app/?site={site.id}
      </footer>
    </main>
  );
}
