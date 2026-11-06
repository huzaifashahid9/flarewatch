"use client";

import type React from "react";

// The plain-language view: big numbers in rupees and homes, no jargon.
// The expert view (FlareMap's original panel) is one tap away.

import type { Meta, SiteProps } from "@/lib-types";
import { useT, useLang } from "@/i18n";
import { gradeOf } from "@/grade";
import { GradeBadge, ProvinceRanking, TrendLine, WorstList } from "./ReportCard";
import { ChatIcon, CoinIcon, FlameIcon, HomeIcon, PlayIcon, SatelliteIcon, SparkIcon } from "./Icons";

const PKR_PER_USD = 280; // assumed, same as the money counter
const HOURS_PER_YEAR = 8760;
const KWH_PER_HOME = 2400; // assumed yearly use of one Pakistani home

export const crore = (usd: number) => Math.round((usd * PKR_PER_USD) / 1e7);

const homesFromMw = (mw: number) => Math.round((mw * 1000 * HOURS_PER_YEAR) / KWH_PER_HOME);

const num = (n: number) => n.toLocaleString("en-US");

type Counts = { persistent: number; intermittent: number; known: number; new: number };

export function SimplePanel({ meta, counts, onPlay, playing, onExpert, onAsk, sites, onPick }: {
  meta: Meta;
  sites: SiteProps[];
  onPick: (s: SiteProps) => void;
  counts: Counts;
  onPlay?: () => void;
  playing: boolean;
  onExpert: () => void;
  onAsk: () => void;
}) {
  const t = useT();
  const tot = meta.totals;
  const homes = tot ? tot.homes_powered?.mid ?? homesFromMw(tot.power_mw.mid) : 0;
  return (
    <div className="space-y-3">
      {tot && (
        <div className="rounded-xl bg-gradient-to-br from-orange-600/30 to-red-900/30 p-4 ring-1 ring-orange-500/40">
          <div className="text-sm text-orange-100">{t("Every year, Pakistan burns away gas worth")}</div>
          <div className="mt-1 text-4xl font-bold text-white" style={{ lineHeight: 1.5 }}>
            {t("Rs {n} crore", { n: num(crore(tot.value_usd_per_yr.mid)) })}
          </div>
          <div className="mt-1 text-sm text-orange-100">
            {t("That gas could give electricity to {h} homes.", { h: num(homes) })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile icon={<FlameIcon className="h-6 w-6 text-orange-400" />} value={counts.known} label={t("gas flares we can see")} />
        <Tile icon={<SparkIcon className="h-6 w-6 text-cyan-300" />} value={counts.new} label={t("new flares in the last 2 weeks")} />
      </div>

      <WorstList sites={sites} onPick={onPick} />
      {meta.provinces && <ProvinceRanking rows={meta.provinces} />}

      <div className="rounded-xl bg-neutral-900 p-3">
        <div className="mb-2 text-sm font-semibold text-white">{t("How it works")}</div>
        <Step icon={<SatelliteIcon className="h-5 w-5 text-sky-300" />} text={t("Satellites fly over Pakistan every night.")} />
        <Step icon={<FlameIcon className="h-5 w-5 text-orange-400" />} text={t("They spot the heat of gas being burned at oil and gas fields.")} />
        <Step icon={<CoinIcon className="h-5 w-5 text-emerald-300" />} text={t("We work out how much money and electricity is lost.")} />
      </div>

      <div className="rounded-xl bg-neutral-900 p-3 text-sm">
        <div className="mb-2 font-semibold text-white">{t("Reading the map")}</div>
        <Legend color="#ffb020" text={t("Bright dot: a gas flare")} />
        <Legend color="#22d3ee" text={t("Blue dot: a new flare")} />
        <Legend color="#ffb020" faint text={t("Faint dot: maybe a factory, not confirmed")} />
        <div className="mt-2 text-neutral-400">{t("Tap any dot to see what it costs.")}</div>
      </div>

      {onPlay && (
        <button onClick={onPlay}
          className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-neutral-200">
          <span className="inline-flex items-center gap-1.5"><PlayIcon className="h-4 w-4" />
            {playing ? t("Stop the time-lapse") : t("Watch a whole year in one minute")}</span>
        </button>
      )}
      <button onClick={onAsk}
        className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black hover:bg-orange-400">
        <span className="inline-flex items-center gap-1.5"><ChatIcon className="h-4 w-4" />{t("Ask a question in plain words")}</span>
      </button>
      <button onClick={onExpert}
        className="w-full rounded-lg bg-neutral-800 py-2 text-sm text-neutral-200 hover:bg-neutral-700">
        {t("Show all the numbers (expert view)")}
      </button>
    </div>
  );
}

function Tile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-3 text-center">
      <div className="flex justify-center">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm text-neutral-200">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Legend({ color, text, faint }: { color: string; text: string; faint?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-neutral-200">
      <span className="inline-block h-3 w-3 rounded-full"
        style={{ background: color, opacity: faint ? 0.35 : 1, outline: faint ? `1.5px solid ${color}` : undefined }} />
      {text}
    </div>
  );
}

/** Popup content for one site in the simple view. */
export function SimpleSite({ site, onDetails }: { site: SiteProps; onDetails: () => void }) {
  const t = useT();
  const usd = site.impact?.value_usd_per_yr.mid;
  const homes = site.impact ? site.impact.homes_powered?.mid ?? homesFromMw(site.impact.power_mw.mid) : null;
  const where = site.nearest_field?.name;
  const lang = useLang();
  const g = gradeOf(site);
  return (
    <div dir={lang === "ur" ? "rtl" : "ltr"} className="max-w-[260px] text-sm text-neutral-900">
      <div className="flex items-center gap-1.5 text-base font-semibold">
        {g && <GradeBadge g={g} />}
        {site.activity_class === "new" ? <SparkIcon className="h-5 w-5 text-cyan-600" /> : <FlameIcon className={`h-5 w-5 ${site.in_world_bank_catalogue ? "text-orange-600" : "text-neutral-400"}`} />}
        {site.activity_class === "new" ? t("New gas flare") : site.in_world_bank_catalogue ? t("Gas flare") : t("Hot spot, not confirmed")}
      </div>
      {where && <div className="text-neutral-600">{t("Near {f}", { f: where })}</div>}
      {site.nearest_field?.operator && <div className="text-neutral-600">{t("Field run by {c}", { c: site.nearest_field.operator })}</div>}
      <div className="mt-1">{t("Seen burning on {n} nights this year.", { n: site.nights_detected })}</div>
      <TrendLine site={site} className="text-xs" />
      {usd != null && usd > 0 ? (
        <div className="mt-2 rounded-lg bg-orange-50 p-2">
          <div className="text-lg font-bold text-orange-700">{t("Rs {n} crore a year", { n: num(Math.max(1, crore(usd))) })}</div>
          <div className="flex items-center gap-1 text-neutral-700"><HomeIcon className="h-4 w-4 shrink-0" />{t("of gas burned here, enough for {h} homes.", { h: num(homes ?? 0) })}</div>
        </div>
      ) : (
        <div className="mt-2 text-neutral-600">
          {site.in_world_bank_catalogue ? t("We don't have an amount for this flare yet.") : t("This may be a factory such as a brick kiln, so we don't count it.")}
        </div>
      )}
      <button onClick={onDetails} className="mt-2 text-xs font-medium text-orange-700 underline">
        {t("See full details")}
      </button>
    </div>
  );
}
