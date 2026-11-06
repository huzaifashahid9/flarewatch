"use client";

import { useLang, useT } from "@/i18n";

import { useMemo, useState } from "react";
import type { SiteProps } from "@/lib-types";

type Row = { label: string; lat: number; lon: number; reported: number };
type Verdict = "under" | "consistent" | "over" | "no-estimate" | "not-seen";

const MATCH_RADIUS_M = 2000;
// Made-up example report for the demo, not any company's real figures.
const TEMPLATE = [
  "name,lat,lon,reported_mmscfd",
  "Example flare A,25.3881,68.5821,0.5",
  "Example flare B,33.4073,71.9386,0.95",
  "Example flare C,25.7945,68.6973,0.2",
  "Example flare D,27.5000,66.0000,0.3",
].join("\n") + "\n";

function haversine(a: number, b: number, c: number, d: number) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function parse(text: string): { rows: Row[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["Need a header line and at least one row."] };
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col(["name", "field", "site", "flare"]);
  const iLat = col(["lat", "latitude"]);
  const iLon = col(["lon", "lng", "longitude"]);
  const iQ = col(["reported_mmscfd", "mmscfd", "reported"]);
  if (iLat < 0 || iLon < 0 || iQ < 0) {
    return { rows: [], errors: ["Columns needed: lat, lon, reported_mmscfd (name is optional)."] };
  }
  const rows: Row[] = [], errors: string[] = [];
  lines.slice(1).forEach((l, i) => {
    const c = l.split(",");
    const lat = +c[iLat], lon = +c[iLon], q = +c[iQ];
    if ([lat, lon, q].some((n) => !Number.isFinite(n))) errors.push(`Row ${i + 2}: not a number`);
    else rows.push({ label: iName >= 0 ? c[iName].trim() : `Row ${i + 2}`, lat, lon, reported: q });
  });
  return { rows, errors };
}

const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  under: { text: "Reported below satellite range", cls: "bg-red-500/20 text-red-300" },
  consistent: { text: "Consistent", cls: "bg-emerald-500/20 text-emerald-300" },
  over: { text: "Reported above satellite range", cls: "bg-amber-500/20 text-amber-300" },
  "no-estimate": { text: "Flare seen, no volume yet", cls: "bg-neutral-700 text-neutral-300" },
  "not-seen": { text: "No flare seen within 2 km", cls: "bg-neutral-700 text-neutral-300" },
};

export default function ReconcilePanel({ sites, onClose, onPick, inline }: {
  sites: SiteProps[]; onClose?: () => void; onPick: (s: SiteProps) => void; inline?: boolean;
}) {
  const [text, setText] = useState("");
  const { rows, errors } = useMemo(() => (text ? parse(text) : { rows: [], errors: [] }), [text]);
  const results = rows.map((r) => {
    let best: SiteProps | null = null, dist = Infinity;
    for (const s of sites) {
      const d = haversine(r.lat, r.lon, s.lat, s.lon);
      if (d < dist) { dist = d; best = s; }
    }
    const site = dist <= MATCH_RADIUS_M ? best : null;
    let verdict: Verdict = "not-seen";
    if (site?.volume) {
      const m = site.volume.mmscfd;
      verdict = r.reported < m.low ? "under" : r.reported > m.high ? "over" : "consistent";
    } else if (site) verdict = "no-estimate";
    return { r, site, verdict };
  });
  const flagged = results.filter((x) => x.verdict === "under").length;
  const t = useT();
  const lang = useLang();

  return (
    <aside dir={lang === "ur" ? "rtl" : "ltr"} className={inline ? "w-full max-w-3xl text-sm text-neutral-200" : "absolute bottom-4 right-4 top-16 w-[24rem] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-neutral-950/90 p-4 text-sm text-neutral-200 shadow-xl backdrop-blur"}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{t("Reported vs observed")}</h2>
          <p className="text-xs text-neutral-400">
            {t("Compare an operator's flare report with what the satellites see. The file stays in your browser; nothing is uploaded.")}
          </p>
        </div>
        {onClose && <button onClick={onClose} className="rounded px-2 text-lg text-neutral-400 hover:text-white" aria-label="Close">×</button>}
      </div>
      <div className="mt-3 flex gap-2 text-xs">
        <label className="cursor-pointer rounded bg-orange-500 px-2.5 py-1.5 font-medium text-black">
          {t("Upload CSV")}
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => e.target.files?.[0]?.text().then(setText)} />
        </label>
        <button className="rounded bg-neutral-800 px-2.5 py-1.5" onClick={() => setText(TEMPLATE)}>{t("Try a made-up example")}</button>
        <a className="rounded bg-neutral-800 px-2.5 py-1.5" download="flare_report_template.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>{t("Template")}</a>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder={t("or paste CSV: name,lat,lon,reported_mmscfd")} dir="ltr"
        className="mt-2 w-full rounded bg-neutral-900 p-2 font-mono text-xs text-neutral-200" />
      {errors.map((e) => <p key={e} className="text-xs text-red-400">{t(e)}</p>)}
      {results.length > 0 && (
        <>
          <p className="mt-2 text-xs text-neutral-300">
            {t("{n} reported flares checked", { n: results.length })} · <span className="text-red-300">{t("{n} below the satellite range", { n: flagged })}</span>
          </p>
          <div className="mt-2 space-y-2">
            {results.map(({ r, site, verdict }, i) => (
              <button key={i} disabled={!site} onClick={() => site && onPick(site)}
                className="block w-full rounded-lg bg-neutral-900 p-2.5 text-left ring-1 ring-neutral-800 enabled:hover:ring-orange-500/50">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-white">{r.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${VERDICT[verdict].cls}`}>{t(VERDICT[verdict].text)}</span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {t("Reported {q} MMSCFD", { q: r.reported })}
                  {site?.volume && ` · ${t("satellite {a} to {b} MMSCFD", { a: site.volume.mmscfd.low.toFixed(2), b: site.volume.mmscfd.high.toFixed(2) })}`}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            {t("Satellite ranges come from the World Bank yearly estimate for each flare. A mismatch is a reason to ask questions, not proof: reports may cover a different period or several flares.")}
          </p>
        </>
      )}
    </aside>
  );
}
