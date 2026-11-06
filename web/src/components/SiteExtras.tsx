"use client";

import { useEffect, useState } from "react";
import { useLang, useT } from "@/i18n";
import type { Briefing, SiteProps } from "@/lib-types";
import { BellIcon } from "./Icons";

const num = (n: number) => n.toLocaleString("en-US");

// --- Satellite photo -------------------------------------------------------
// Sentinel-2 cloudless 2023 mosaic from EOX (10 m pixels), tiles stitched around the site.
const Z = 14;
const TILE = 256;
const EOX = (x: number, y: number) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/${Z}/${y}/${x}.jpg`;

function tileXY(lat: number, lon: number) {
  const n = 2 ** Z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

export function SatellitePhoto({ site }: { site: SiteProps }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const { x, y } = tileXY(site.lat, site.lon);
  const cx = Math.floor(x), cy = Math.floor(y);
  // Offset so the site sits in the centre of a 3x3 block shown in a 100% x 288px window.
  const left = -((x - cx + 1) * TILE);
  const top = -((y - cy + 1) * TILE);
  const metresPerPx = (40075016.7 * Math.cos((site.lat * Math.PI) / 180)) / (TILE * 2 ** Z);
  const scalePx = 500 / metresPerPx;
  const tiles = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push([cx + dx, cy + dy, dx + 1, dy + 1]);
  const gmaps = `https://www.google.com/maps/@${site.lat},${site.lon},1500m/data=!3m1!1e3`;
  return (
    <div dir="ltr">
      {failed ? (
        <p className="text-sm text-neutral-400">{t("The satellite photo could not load.")}</p>
      ) : (
        <div className="relative h-72 overflow-hidden rounded-lg bg-neutral-800">
          <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(${left}px, ${top}px)` }}>
            {tiles.map(([tx, ty, gx, gy]) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${tx}-${ty}`} src={EOX(tx, ty)} alt="" width={TILE} height={TILE} loading="lazy" onError={() => setFailed(true)}
                className="absolute max-w-none" style={{ left: gx * TILE, top: gy * TILE }} />
            ))}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-400 shadow-[0_0_0_2px_rgba(0,0,0,.5)]" />
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            <div className="mb-0.5 h-1 bg-white" style={{ width: scalePx }} />500 m
          </div>
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">
        Sentinel-2 cloudless 2023 by <a className="underline" href="https://s2maps.eu" target="_blank" rel="noopener">EOX IT Services GmbH</a> (contains modified Copernicus Sentinel data 2023).{" "}
        <a className="underline" href={gmaps} target="_blank" rel="noopener">{t("Open in Google Maps")}</a>
      </p>
    </div>
  );
}

// --- Night vs day check ----------------------------------------------------
export function firePatternText(site: SiteProps, t: ReturnType<typeof useT>): string | null {
  if (!site.fire_pattern) return null;
  if (site.fire_pattern === "day and night") return t("Burns day and night, like a gas flare.");
  if (site.fire_pattern === "mostly daytime") return t("Seen mostly in daytime, more like a crop or rubbish fire than a gas flare.");
  return t("Not enough passes yet to tell if it burns day and night.");
}

export function FirePatternLine({ site, className = "" }: { site: SiteProps; className?: string }) {
  const t = useT();
  const text = firePatternText(site, t);
  if (!text) return null;
  const color = site.fire_pattern === "mostly daytime" ? "text-amber-500" : site.fire_pattern === "day and night" ? "text-emerald-500" : "text-neutral-400";
  return <div className={`${color} ${className}`}>{text}</div>;
}

export function DayNightCounts({ site }: { site: SiteProps }) {
  const t = useT();
  if (site.days_seen == null) return null;
  return <span>{t("{n} night passes, {d} day passes", { n: site.nights_detected, d: site.days_seen })}</span>;
}

// --- People nearby ---------------------------------------------------------
export function PeopleLine({ site, className = "" }: { site: SiteProps; className?: string }) {
  const t = useT();
  if (site.people_within_5km == null) return null;
  return <div className={className}>{t("About {n} people live within 5 km.", { n: num(Math.round(site.people_within_5km / 100) * 100) })}</div>;
}

// --- Follow a flare --------------------------------------------------------
export function FollowFlare({ site }: { site: SiteProps }) {
  const t = useT();
  const lang = useLang();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const followed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("followed") === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, site: site.id, lang }) }).catch(() => null);
    if (r?.ok) return setState("sent");
    const body = (await r?.json().catch(() => null)) as { error?: string } | null;
    setMsg(r?.status === 503 ? t("Following is not switched on for this site yet.") : t(body?.error ?? "Something went wrong. Try again later."));
    setState("error");
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-semibold text-white"><BellIcon className="h-4 w-4 text-orange-400" />{t("Follow this flare")}</div>
      {followed ? (
        <p className="text-sm text-emerald-400">{t("You are following this flare. We will email you when its grade changes.")}</p>
      ) : state === "sent" ? (
        <p className="text-sm text-emerald-400">{t("Check your inbox and click the link to confirm.")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-xs text-neutral-400">{t("Get an email when this flare's report card grade changes. One click to stop.")}</p>
          <div className="flex gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("Your email")} dir="ltr"
              className="min-w-0 flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
            <button disabled={state === "sending"} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
              {state === "sending" ? t("Sending…") : t("Follow")}
            </button>
          </div>
          {state === "error" && <p className="text-xs text-red-400">{msg}</p>}
        </form>
      )}
    </div>
  );
}

// --- Weekly AI briefing ----------------------------------------------------
let briefing: Promise<Briefing | null> | null = null;
const loadBriefing = () => (briefing ??= fetch("/data/briefing.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function useBriefing() {
  const [b, setB] = useState<Briefing | null>(null);
  useEffect(() => {
    let live = true;
    loadBriefing().then((x) => live && setB(x));
    return () => { live = false; };
  }, []);
  return b;
}

export function BriefingCard() {
  const t = useT();
  const lang = useLang();
  const b = useBriefing();
  if (!b) return null;
  const ur = lang === "ur";
  return (
    <section className="rounded-xl bg-gradient-to-br from-orange-950/60 to-neutral-900 p-4 ring-1 ring-orange-900/60">
      <div className="text-xs font-medium uppercase tracking-wide text-orange-300">
        {t("This week's briefing")} · <span dir="ltr">{new Date(b.generated_at).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
      </div>
      <h2 className="mt-1 text-lg font-semibold text-white" style={ur ? { lineHeight: 1.9 } : undefined}>{ur ? b.headline_ur : b.headline_en}</h2>
      <p className="mt-1 text-sm text-neutral-300" style={ur ? { lineHeight: 2.1 } : undefined}>{ur ? b.summary_ur : b.summary_en}</p>
      <p className="mt-2 text-[11px] text-neutral-500">{t("Written by AI from the week's satellite numbers. Check the numbers on each flare page.")}</p>
    </section>
  );
}
