"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { Timeline } from "@/lib-types";

export type DayIndex = Map<number, [number, number][]>;

export function indexByDay(t: Timeline): { byDay: DayIndex; days: number } {
  const byDay: DayIndex = new Map();
  let days = 0;
  for (const [d, lat, lon] of t.rows) {
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push([lat, lon]);
    days = Math.max(days, d + 1);
  }
  return { byDay, days };
}

export const dayLabel = (start: string, d: number) => {
  const t = new Date(start + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

/** Draws tonight's detections bright and the previous few nights fading. */
export function TimelapseLayer({ byDay, day }: { byDay: DayIndex; day: number }) {
  const map = useMap();
  const layer = useRef<google.maps.Data | null>(null);
  useEffect(() => {
    if (!map) return;
    const l = new google.maps.Data({ map });
    l.setStyle((f) => {
      const age = Number(f.getProperty("age"));
      return {
        clickable: false,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: age === 0 ? 5 : 3.5,
          fillColor: age === 0 ? "#fff3b0" : "#ff7a1a",
          fillOpacity: age === 0 ? 0.95 : 0.5 / age,
          strokeWeight: 0,
        },
      };
    });
    layer.current = l;
    return () => { l.setMap(null); layer.current = null; };
  }, [map]);
  useEffect(() => {
    const l = layer.current;
    if (!l) return;
    l.forEach((f) => l.remove(f));
    for (let age = 3; age >= 0; age--) {
      for (const [lat, lon] of byDay.get(day - age) ?? []) {
        l.add({ geometry: new google.maps.LatLng(lat, lon), properties: { age } });
      }
    }
  }, [byDay, day, map]);
  return null;
}

export function TimelapseBar({ start, days, day, playing, onDay, onPlay, count }: {
  start: string; days: number; day: number; playing: boolean; count: number;
  onDay: (d: number) => void; onPlay: (p: boolean) => void;
}) {
  const tick = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    // About 60 seconds for a full year.
    tick.current = window.setInterval(() => onDay(-1), 160);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [playing, onDay]);
  const pct = useMemo(() => (days > 1 ? (day / (days - 1)) * 100 : 0), [day, days]);
  return (
    <div className="absolute bottom-6 left-1/2 w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-neutral-950/90 px-4 py-3 text-sm text-neutral-200 shadow-xl backdrop-blur">
      <div className="flex items-center gap-3">
        <button onClick={() => onPlay(!playing)} aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg text-black">
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-white">{dayLabel(start, day)}</span>
            <span className="text-neutral-400">{count} fires seen that night</span>
          </div>
          <input type="range" min={0} max={days - 1} value={day} onChange={(e) => { onPlay(false); onDay(+e.target.value); }}
            className="mt-1 w-full accent-orange-500" style={{ backgroundSize: `${pct}% 100%` }} aria-label="Night" />
        </div>
      </div>
    </div>
  );
}
