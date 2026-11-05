export type Range = { low: number; mid: number; high: number };

export type SiteProps = {
  id: string;
  lat: number;
  lon: number;
  activity_class: "persistent" | "intermittent" | "sporadic" | "unknown";
  active_share: number;
  nights_detected: number;
  last_seen: string;
  satellites: string[];
  mean_frp_mw: number | null;
  baseline_year: number | null;
  in_world_bank_catalogue: boolean;
  volume: {
    bcm_per_yr: Range;
    mmscfd: Range;
    method: "nightfire" | "indicative" | "baseline";
    extrapolated: boolean;
    note: string;
  } | null;
};

export type Meta = {
  generated_at: string;
  sources: string[];
  firms_satellites: string[];
  calibration: string;
  site_count: number;
  notes: string[];
};
