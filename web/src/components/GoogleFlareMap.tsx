"use client";

import { useEffect } from "react";
import { APIProvider, ControlPosition, InfoWindow, Map, useMap } from "@vis.gl/react-google-maps";
import type { SiteProps } from "@/lib-types";

type FC = GeoJSON.FeatureCollection<GeoJSON.Point, SiteProps>;

const COLOR: Record<string, string> = {
  persistent: "#ffb020",
  intermittent: "#ff7a1a",
  monitoring: "#a3a3a3",
};
const SCALE: Record<string, number> = { persistent: 7, intermittent: 5.5 };

function SitesLayer({ data, onSelect }: { data: FC; onSelect: (s: SiteProps | null) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const added = map.data.addGeoJson(data);
    map.data.setStyle((f) => {
      const cls = String(f.getProperty("activity_class"));
      const known = Boolean(f.getProperty("in_world_bank_catalogue"));
      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: SCALE[cls] ?? 4,
          fillColor: COLOR[cls] ?? "#c2410c",
          // Known World Bank flares are solid; unconfirmed heat sources are
          // faint so they never read as flares.
          fillOpacity: known ? 1 : 0.35,
          strokeColor: known ? "#1a1a1a" : "#ffb020",
          strokeWeight: known ? 1 : 1.5,
        },
      };
    });
    const click = map.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
      const props: Record<string, unknown> = {};
      e.feature.forEachProperty((v, k) => (props[k] = v));
      onSelect(props as unknown as SiteProps);
    });
    return () => {
      click.remove();
      added.forEach((f) => map.data.remove(f));
    };
  }, [map, data, onSelect]);
  return null;
}

/** Pan to a site opened from a shared link. */
function Focus({ site }: { site: SiteProps | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !site) return;
    // Wait a moment so the initial fit-to-Pakistan does not undo the zoom.
    const t = setTimeout(() => map.moveCamera({ center: { lat: site.lat, lng: site.lon }, zoom: 11 }), 400);
    return () => clearTimeout(t);
  }, [map, site]);
  return null;
}

export default function GoogleFlareMap({
  apiKey, data, selected, onSelect, renderSite, focus = null,
}: {
  focus?: SiteProps | null;
  apiKey: string;
  data: FC | null;
  selected: SiteProps | null;
  onSelect: (s: SiteProps | null) => void;
  renderSite: (s: SiteProps) => React.ReactNode;
}) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={{ lat: 30.0, lng: 69.3 }}
        defaultZoom={6}
        defaultBounds={{ north: 37.1, south: 23.6, west: 60.8, east: 77.9 }}
        mapTypeId="hybrid"
        mapTypeControl
        mapTypeControlOptions={{ position: ControlPosition.TOP_RIGHT }}
        streetViewControl={false}
        fullscreenControl={false}
        gestureHandling="greedy"
        style={{ width: "100%", height: "100%" }}
        onClick={() => onSelect(null)}
      >
        {data && <SitesLayer data={data} onSelect={onSelect} />}
        <Focus site={focus} />
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lon }}
            onCloseClick={() => onSelect(null)}
            maxWidth={320}
          >
            {renderSite(selected)}
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  );
}
