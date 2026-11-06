"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Map, { Layer, Popup, Source, NavigationControl } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Meta, SiteProps, Timeline } from "@/lib-types";
import { indexByDay, TimelapseBar } from "./Timelapse";
import { MoneyCounter, Tracker2030 } from "./Counter";
import { LangContext, useLang, useT, type Lang } from "@/i18n";
import GoogleFlareMap from "./GoogleFlareMap";
import SiteReport from "./SiteReport";
import ReconcilePanel from "./ReconcilePanel";
import AnalystPanel from "./AnalystPanel";
import { SimplePanel, SimpleSite } from "./SimpleView";
import { DreToggle, Headline, SiteImpact, type Dre } from "./Impact";

// Set in Vercel (Project → Settings → Environment Variables). Without it the
// map falls back to the free CARTO basemap.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type FC = GeoJSON.FeatureCollection<GeoJSON.Point, SiteProps>;

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

const METHOD_LABEL: Record<string, string> = {
  nightfire: "Measured (VIIRS Nightfire)",
  baseline: "World Bank yearly estimate",
  indicative: "Estimated from brightness (indicative)",
};

export default function FlareMap() {
  const [data, setData] = useState<FC | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<SiteProps | null>(null);
  const [dre, setDre] = useState<Dre>("official");
  const [focus, setFocus] = useState<SiteProps | null>(null);
  const [reconcile, setReconcile] = useState(false);
  const [analyst, setAnalyst] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  // Simple view for everyone by default; ?view=expert opens the full panel.
  const [mode, setMode] = useState<"simple" | "expert">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "expert" ? "expert" : "simple");
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [tlOn, setTlOn] = useState(false);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tl = useMemo(() => (timeline ? indexByDay(timeline) : null), [timeline]);
  const stepDay = useCallback((d: number) => {
    setDay((prev) => (d === -1 ? (tl && prev + 1 < tl.days ? prev + 1 : 0) : d));
  }, [tl]);
  const startTimelapse = async () => {
    setSelected(null); setAnalyst(false); setReconcile(false);
    if (!timeline) {
      const r = await fetch("/data/timeline.json");
      if (!r.ok) return;
      setTimeline(await r.json());
    }
    setDay(0); setTlOn(true); setPlaying(true);
  };

  useEffect(() => {
    Promise.all([
      fetch("/data/sites.geojson").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/data/meta.json").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([sites, m]) => {
        setData(sites);
        // Shareable links: /?site=PK-25.3881-68.5821 opens that site's report.
        const want = new URLSearchParams(window.location.search).get("site");
        const hit = want && (sites as FC).features.find((f) => f.properties.id === want);
        if (hit) {
          setSelected(hit.properties);
          setFocus(hit.properties);
        }
        setMeta(m);
      })
      .catch(() => setLoadError(true));
  }, []);

  const counts = useMemo(() => {
    const c = { persistent: 0, intermittent: 0, monitoring: 0, known: 0, new: 0 };
    data?.features.forEach((f) => {
      if (f.properties.in_world_bank_catalogue) c.known += 1;
      const k = f.properties.activity_class as keyof typeof c;
      if (k in c) c[k] += 1;
    });
    return c;
  }, [data]);

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) return setSelected(null);
    const p = f.properties as Record<string, unknown>;
    // MapLibre stringifies nested properties; parse them back.
    const parsed = Object.fromEntries(
      Object.entries(p).map(([k, v]) => {
        if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
          try {
            return [k, JSON.parse(v)];
          } catch {
            return [k, v];
          }
        }
        return [k, v];
      }),
    ) as SiteProps;
    setSelected(parsed);
  };

  return (
    <LangContext.Provider value={lang}>
    <div className={`relative h-full w-full ${lang === "ur" ? "font-urdu" : ""}`}>
      {GOOGLE_KEY ? (
        <GoogleFlareMap
          apiKey={GOOGLE_KEY}
          data={data}
          selected={selected}
          onSelect={setSelected}
          focus={focus}
          timelapse={tlOn && tl ? { byDay: tl.byDay, day } : null}
          renderSite={(s) => mode === "simple" ? <SimpleSite site={s} onDetails={() => setMode("expert")} /> : <SitePanel site={s} dre={dre} />}
        />
      ) : (
      <Map
        initialViewState={{ longitude: 69.3, latitude: 30.0, zoom: 4.6 }}
        mapStyle={BASEMAP}
        interactiveLayerIds={data ? ["sites"] : []}
        onClick={onClick}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />
        {data && (
          <Source id="sites" type="geojson" data={data}>
            <Layer
              id="sites-glow"
              type="circle"
              paint={{
                "circle-radius": 14,
                "circle-color": "#ff7a1a",
                "circle-opacity": 0.18,
                "circle-blur": 1,
              }}
            />
            <Layer
              id="sites"
              type="circle"
              paint={{
                "circle-radius": [
                  "match",
                  ["get", "activity_class"],
                  "persistent", 6,
                  "intermittent", 4.5,
                  3,
                ],
                "circle-color": [
                  "match",
                  ["get", "activity_class"],
                  "persistent", "#ffb020",
                  "intermittent", "#ff7a1a",
                  "monitoring", "#a3a3a3",
                  "new", "#22d3ee",
                  "#c2410c",
                ],
                // Known World Bank flares are solid; unconfirmed heat
                // sources are drawn faint so they never read as flares.
                "circle-opacity": ["case", ["get", "in_world_bank_catalogue"], 1, 0.35],
                "circle-stroke-color": ["case", ["get", "in_world_bank_catalogue"], "#1a1a1a", "#ffb020"],
                "circle-stroke-width": ["case", ["get", "in_world_bank_catalogue"], 1, 1.5],
              }}
            />
          </Source>
        )}
        {selected && (
          <Popup
            longitude={selected.lon}
            latitude={selected.lat}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            maxWidth="320px"
          >
            {mode === "simple" ? <SimpleSite site={selected} onDetails={() => setMode("expert")} /> : <SitePanel site={selected} dre={dre} />}
          </Popup>
        )}
      </Map>
      )}

      <aside dir={lang === "ur" ? "rtl" : "ltr"} className="absolute left-4 top-4 w-80 max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-neutral-950/85 p-4 text-sm text-neutral-200 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">FlareWatch</h1>
          <div className="flex gap-1">
            <button onClick={() => setMode(mode === "simple" ? "expert" : "simple")}
              className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-700">
              <LeftText k={mode === "simple" ? "Expert view" : "Simple view"} />
            </button>
            <button onClick={() => setLang(lang === "en" ? "ur" : "en")}
              className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-700">
              {lang === "en" ? "اردو" : "English"}
            </button>
          </div>
        </div>
        <LeftText k="Gas flares across Pakistan, seen from space every night." className="text-neutral-400" />
        {loadError && (
          <LeftText className="mt-3 rounded-md bg-neutral-800 p-2 text-neutral-300"
            k="No data yet. The nightly job has not produced a run for this deployment." />
        )}
        {data && meta && mode === "simple" && (
          <div className="mt-3">
            <SimplePanel meta={meta} counts={counts} playing={tlOn} onExpert={() => setMode("expert")}
              onAsk={() => { setSelected(null); setReconcile(false); setAnalyst(true); }}
              onPlay={GOOGLE_KEY ? () => (tlOn ? (setTlOn(false), setPlaying(false)) : startTimelapse()) : undefined} />
          </div>
        )}
        {data && meta && mode === "expert" && (
          <>
            {meta.totals && <Headline t={meta.totals} meta={meta} dre={dre} />}
            {meta.totals && <DreToggle dre={dre} onChange={setDre} meta={meta} />}
            {meta.totals && <MoneyCounter usdPerYear={meta.totals.value_usd_per_yr.mid} />}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Persistent" value={counts.persistent} />
              <Stat label="Intermittent" value={counts.intermittent} />
              {counts.monitoring > 0 ? (
                <Stat label="Monitoring" value={counts.monitoring} />
              ) : (
                <Stat label="Known flares" value={counts.known} />
              )}
            </div>
            <LeftText className="mt-2 text-xs text-neutral-400"
              k="{k} of {n} sites match known flares in the World Bank catalogue (solid dots). Faint dots are unconfirmed heat sources, which may be cement, steel or brick plants."
              vars={{ k: counts.known, n: data.features.length }} />
            {counts.new > 0 && (
              <div className="mt-2 rounded-lg bg-cyan-900/30 p-2 ring-1 ring-cyan-400/40">
                <LeftText className="text-xs font-semibold text-cyan-200" k="New flares in the last two weeks" />
                {data.features.filter((f) => f.properties.activity_class === "new").map((f) => (
                  <button key={f.properties.id} onClick={() => { setSelected(f.properties); setFocus(f.properties); }}
                    className="block text-left text-xs text-cyan-100 underline">
                    {f.properties.id}{f.properties.nearest_field ? ` · ${f.properties.nearest_field.name}` : ""}
                  </button>
                ))}
              </div>
            )}
            {counts.monitoring > 0 && (
              <LeftText className="mt-2 text-xs text-neutral-400"
                k="Grey sites have under 3 months of history, so they may still be crop fires or industry. They are confirmed or dropped as data builds up." />
            )}
            {GOOGLE_KEY && (
              <button onClick={() => (tlOn ? (setTlOn(false), setPlaying(false)) : startTimelapse())}
                className="mt-3 w-full rounded-md bg-white py-2 text-sm font-semibold text-black hover:bg-neutral-200">
                <LeftText k={tlOn ? "Stop the time-lapse" : "Play a year of flares in 60 seconds"} />
              </button>
            )}
            <button onClick={() => { setSelected(null); setReconcile(false); setAnalyst(true); }}
              className="mt-3 w-full rounded-md bg-orange-500 py-2 text-sm font-semibold text-black hover:bg-orange-400">
              <LeftText k="Ask the AI analyst" />
            </button>
            <button onClick={() => { setSelected(null); setAnalyst(false); setReconcile(true); }}
              className="mt-2 w-full rounded-md bg-neutral-800 py-2 text-sm font-medium text-white hover:bg-neutral-700">
              <LeftText k="Check a flare report against satellites" />
            </button>
            <Tracker2030 meta={meta} />
            <DataHealth meta={meta} />
          </>
        )}
      </aside>
      {tlOn && tl && timeline && (
        <TimelapseBar start={timeline.start} days={tl.days} day={day} playing={playing}
          count={tl.byDay.get(day)?.length ?? 0} onDay={stepDay} onPlay={setPlaying} />
      )}
      {analyst && !selected && !reconcile && <AnalystPanel onClose={() => setAnalyst(false)} />}
      {reconcile && !selected && data && (
        <ReconcilePanel sites={data.features.map((f) => f.properties)} onClose={() => setReconcile(false)}
          onPick={(s) => { setSelected(s); setFocus(s); }} />
      )}
      {selected && meta && mode === "expert" && (
        <SiteReport site={selected} meta={meta} onClose={() => setSelected(null)} />
      )}
    </div>
    </LangContext.Provider>
  );
}

function LeftText({ k, vars, className }: { k: string; vars?: Record<string, string | number>; className?: string }) {
  const t = useT();
  return <span className={className ? `block ${className}` : undefined}>{t(k, vars)}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  const t = useT();
  return (
    <div className="rounded-md bg-neutral-900 p-2">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="text-xs text-neutral-400">{t(label)}</div>
    </div>
  );
}

const SOURCE_NAME: Record<string, string> = {
  "nasa-firms": "NASA FIRMS", "world-bank-per-flare": "World Bank", openstreetmap: "OpenStreetMap", nightfire: "VIIRS Nightfire",
};

function DataHealth({ meta }: { meta: Meta }) {
  const t = useT();
  const updated = new Date(meta.generated_at);
  return (
    <div className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
      <div>
        <LeftText k="Last updated" />{" "}
        <span className="text-neutral-200">
          {updated.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT
        </span>
      </div>
      <div>{t("Satellites")}: <span dir="ltr">{meta.firms_satellites.map((s) => s.replace("VIIRS_", "").replace("_NRT", "")).join(", ")}</span></div>
      <div>{t("Sources")}: <span dir="ltr">{meta.sources.map((s) => SOURCE_NAME[s] ?? s).join(", ")}</span></div>
      {meta.notes.map((n) => (
        <div key={n} className="mt-1 text-amber-300/80">
          {n}
        </div>
      ))}
    </div>
  );
}

function SitePanel({ site, dre }: { site: SiteProps; dre: Dre }) {
  const v = site.volume;
  const t = useT();
  const lang = useLang();
  return (
    <div dir={lang === "ur" ? "rtl" : "ltr"} className="text-sm text-neutral-900">
      <div className="font-semibold capitalize">{t(site.activity_class.charAt(0).toUpperCase() + site.activity_class.slice(1))} {t("site")}</div>
      {site.in_world_bank_catalogue ? (
        <div className="text-xs text-emerald-700">{t("Known flare (World Bank {y})", { y: site.baseline_year ?? "" })}</div>
      ) : (
        <div className="text-xs text-amber-700">
          {t("Unconfirmed: not a known flare. Could be a cement, steel or brick plant.")}
        </div>
      )}
      {site.nearest_field && (
        <div className="text-xs text-neutral-700">
          {t("Nearest named field: {f} ({km} km, OpenStreetMap)", { f: site.nearest_field.name, km: site.nearest_field.km })}
          {site.nearest_field.operator ? ` · ${site.nearest_field.operator}` : ""}
        </div>
      )}
      <div className="text-xs text-neutral-600" dir="ltr">
        {site.lat.toFixed(4)}, {site.lon.toFixed(4)}
      </div>
      <div className="mt-2">
        {t("Seen on {n} nights, last {d}", { n: site.nights_detected, d: site.last_seen })}
      </div>
      <div>{t("Satellites")}: {site.satellites.join(", ")}</div>
      {site.mean_frp_mw != null && <div>{t("Brightness: {b} MW (FIRMS FRP)", { b: fmt(site.mean_frp_mw, 1) })}</div>}
      {v ? (
        <div className="mt-2 rounded bg-orange-50 p-2">
          <div className="font-medium">
            {fmt(v.mmscfd.mid)} MMSCFD{" "}
            <span className="text-neutral-600">
              {t("(range {a} to {b})", { a: fmt(v.mmscfd.low), b: fmt(v.mmscfd.high) })}
            </span>
          </div>
          <div className="text-xs text-neutral-600">{t(METHOD_LABEL[v.method])}</div>
          {site.impact && <SiteImpact i={site.impact} dre={dre} />}
          {v.extrapolated && (
            <div className="text-xs text-amber-700">{t("Above the tested calibration range")}</div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-xs text-neutral-600">
          {t("No volume yet: not in the World Bank catalogue and no Nightfire data.")}
        </div>
      )}
    </div>
  );
}
