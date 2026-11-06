"use client";

import { useEffect, useState } from "react";
import type { Meta, SiteProps } from "@/lib-types";

// One fetch of the public data per page load, shared by every page.
type Data = { sites: SiteProps[]; meta: Meta };
let cache: Promise<Data> | null = null;

function load(): Promise<Data> {
  cache ??= Promise.all([
    fetch("/data/sites.geojson").then((r) => (r.ok ? r.json() : Promise.reject(new Error("sites")))),
    fetch("/data/meta.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error("meta")))),
  ]).then(([g, meta]) => ({ sites: (g.features as { properties: SiteProps }[]).map((f) => f.properties), meta }))
    .catch((e) => { cache = null; throw e; });
  return cache;
}

export function useFlareData() {
  const [state, setState] = useState<{ data: Data | null; error: boolean }>({ data: null, error: false });
  useEffect(() => {
    let live = true;
    load().then((data) => live && setState({ data, error: false }), () => live && setState({ data: null, error: true }));
    return () => { live = false; };
  }, []);
  return state;
}

export const PKR_PER_USD = 280; // assumed display rate
export const crore = (usd: number) => Math.round((usd * PKR_PER_USD) / 1e7);
export const siteName = (s: SiteProps) => s.nearest_field?.name ?? null;
