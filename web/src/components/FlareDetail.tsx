"use client";

import Link from "next/link";
import { crore, useFlareData } from "@/data";
import { gradeOf } from "@/grade";
import { useT } from "@/i18n";
import { GradeBadge, GradeCard } from "./ReportCard";
import { MonthlyChart, RecoveryPlanner } from "./SiteReport";
import { Card } from "./Overview";

const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default function FlareDetail({ id }: { id: string }) {
  const t = useT();
  const { data, error } = useFlareData();
  if (error) return <div className="p-10 text-neutral-400">{t("No data yet. The nightly job has not produced a run for this deployment.")}</div>;
  if (!data) return <div className="p-10 text-neutral-400">{t("Loading…")}</div>;
  const site = data.sites.find((s) => s.id === id);
  if (!site) return <div className="p-10 text-neutral-400">{t("No flare with id {id}.", { id })}</div>;
  const { meta } = data;
  const g = gradeOf(site);
  const i = site.impact;
  const homes = i ? i.homes_powered?.mid ?? (i.power_mw.mid * 1000 * 8760) / 2400 : null;
  const cls = site.activity_class.charAt(0).toUpperCase() + site.activity_class.slice(1);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <Link href="/flares" className="text-xs text-neutral-400 hover:text-white">← {t("All flares")}</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {g && <GradeBadge g={g} big />}
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {site.nearest_field?.name ?? t(site.in_world_bank_catalogue ? "Gas flare" : "Hot spot, not confirmed")}
            </h1>
            <p className="text-sm text-neutral-400">
              {t(cls)} {t("site")}{site.province ? ` · ${t(site.province)}` : ""} · <span dir="ltr">{site.lat.toFixed(4)}, {site.lon.toFixed(4)}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/map?site=${encodeURIComponent(site.id)}`} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white hover:bg-neutral-700">
            {t("Show on map")}
          </Link>
          <a href={`/report/${encodeURIComponent(site.id)}`} target="_blank" rel="noopener"
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200">
            {t("Open audit report (PDF)")}
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Loss per year")} value={i ? t("Rs {n} crore", { n: Math.max(1, crore(i.value_usd_per_yr.mid)) }) : "–"} />
        <Stat label={t("MMSCFD gas")} value={site.volume ? site.volume.mmscfd.mid.toFixed(2) : "–"} />
        <Stat label={t("t CO₂e / yr")} value={i ? compact(i.co2e_t_per_yr.mid) : "–"} />
        <Stat label={t("homes")} value={homes ? compact(homes) : "–"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {g ? <GradeCard site={site} /> : (
            <Card title={t("Flare report card")}>
              <p className="text-sm text-neutral-400">{t("This may be a factory such as a brick kiln, so we don't count it.")}</p>
            </Card>
          )}
          {meta.observed_months && site.monthly_nights && (
            <Card title={t("Activity over the last year")}>
              <MonthlyChart months={meta.observed_months} nights={site.monthly_nights} />
            </Card>
          )}
          <Card title={t("Facts")}>
            <ul className="space-y-1 text-sm text-neutral-300">
              <li>{t("Seen on {n} nights, last {d}", { n: site.nights_detected, d: site.last_seen })}</li>
              {site.first_seen && <li>{t("First seen {d}", { d: site.first_seen })}</li>}
              <li>{site.in_world_bank_catalogue ? t("Known flare (World Bank {y})", { y: site.baseline_year ?? "" }) : t("Unconfirmed: not a known flare. Could be a cement, steel or brick plant.")}</li>
              {site.nearest_field && <li>{t("Nearest named field: {f} ({km} km, OpenStreetMap)", { f: site.nearest_field.name, km: site.nearest_field.km })}</li>}
              <li>{t("Satellites")}: {site.satellites.join(", ")}</li>
            </ul>
          </Card>
        </div>
        <div className="rounded-xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
          {site.volume ? <RecoveryPlanner site={site} meta={meta} /> : (
            <p className="text-sm text-neutral-400">{t("No recovery plan: this site has no volume estimate yet, because it is not a known flare.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
}
