"use client";

import { useEffect, useMemo, useState } from "react";
import Map, { Layer, Popup, Source, NavigationControl } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Meta, SiteProps } from "@/lib-types";
import GoogleFlareMap from "./GoogleFlareMap";
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

  useEffect(() => {
    Promise.all([
      fetch("/data/sites.geojson").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/data/meta.json").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([sites, m]) => {
        setData(sites);
        setMeta(m);
      })
      .catch(() => setLoadError(true));
  }, []);

  const counts = useMemo(() => {
    const c = { persistent: 0, intermittent: 0, monitoring: 0, known: 0 };
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
    <div className="relative h-full w-full">
      {GOOGLE_KEY ? (
        <GoogleFlareMap
          apiKey={GOOGLE_KEY}
          data={data}
          selected={selected}
          onSelect={setSelected}
          renderSite={(s) => <SitePanel site={s} dre={dre} />}
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
            <SitePanel site={selected} dre={dre} />
          </Popup>
        )}
      </Map>
      )}

      <aside className="absolute left-4 top-4 w-80 max-w-[calc(100%-2rem)] rounded-xl bg-neutral-950/85 p-4 text-sm text-neutral-200 shadow-xl backdrop-blur">
        <h1 className="text-lg font-semibold text-white">FlareWatch</h1>
        <p className="text-neutral-400">Gas flares across Pakistan, seen from space every night.</p>
        {loadError && (
          <p className="mt-3 rounded-md bg-neutral-800 p-2 text-neutral-300">
            No data yet. The nightly job has not produced a run for this deployment.
          </p>
        )}
        {data && meta && (
          <>
            {meta.totals && <Headline t={meta.totals} meta={meta} dre={dre} />}
            {meta.totals && <DreToggle dre={dre} onChange={setDre} meta={meta} />}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Persistent" value={counts.persistent} />
              <Stat label="Intermittent" value={counts.intermittent} />
              {counts.monitoring > 0 ? (
                <Stat label="Monitoring" value={counts.monitoring} />
              ) : (
                <Stat label="Known flares" value={counts.known} />
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              {counts.known} of {data.features.length} sites match known flares in the
              World Bank catalogue (solid dots). Faint dots are unconfirmed heat
              sources, which may be cement, steel or brick plants.
            </p>
            {counts.monitoring > 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                Grey sites have under 3 months of history, so they may still be
                crop fires or industry. They are confirmed or dropped as data builds up.
              </p>
            )}
            <DataHealth meta={meta} />
          </>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-900 p-2">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

function DataHealth({ meta }: { meta: Meta }) {
  const updated = new Date(meta.generated_at);
  return (
    <div className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
      <div>
        Last updated{" "}
        <span className="text-neutral-200">
          {updated.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT
        </span>
      </div>
      <div>Satellites: {meta.firms_satellites.join(", ")}</div>
      <div>Sources: {meta.sources.join(", ")}</div>
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
  return (
    <div className="text-sm text-neutral-900">
      <div className="font-semibold capitalize">{site.activity_class} site</div>
      {site.in_world_bank_catalogue ? (
        <div className="text-xs text-emerald-700">Known flare (World Bank {site.baseline_year})</div>
      ) : (
        <div className="text-xs text-amber-700">
          Unconfirmed: not a known flare. Could be a cement, steel or brick plant.
        </div>
      )}
      <div className="text-xs text-neutral-600">
        {site.lat.toFixed(4)}, {site.lon.toFixed(4)}
      </div>
      <div className="mt-2">
        Seen on {site.nights_detected} nights, last {site.last_seen}
      </div>
      <div>Satellites: {site.satellites.join(", ")}</div>
      {site.mean_frp_mw != null && <div>Brightness: {fmt(site.mean_frp_mw, 1)} MW (FIRMS FRP)</div>}
      {v ? (
        <div className="mt-2 rounded bg-orange-50 p-2">
          <div className="font-medium">
            {fmt(v.mmscfd.mid)} MMSCFD{" "}
            <span className="text-neutral-600">
              (range {fmt(v.mmscfd.low)} to {fmt(v.mmscfd.high)})
            </span>
          </div>
          <div className="text-xs text-neutral-600">{METHOD_LABEL[v.method]}</div>
          {site.impact && <SiteImpact i={site.impact} dre={dre} />}
          {v.extrapolated && (
            <div className="text-xs text-amber-700">Above the tested calibration range</div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-xs text-neutral-600">
          No volume yet: not in the World Bank catalogue and no Nightfire data.
        </div>
      )}
    </div>
  );
}
