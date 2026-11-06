export type Range = { low: number; mid: number; high: number };

export type SiteProps = {
  id: string;
  lat: number;
  lon: number;
  activity_class: "persistent" | "intermittent" | "sporadic" | "monitoring" | "new" | "unknown";
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
  impact?: Impact;
  monthly_nights?: number[];
  first_seen?: string;
  nearest_field?: { name: string; operator: string | null; km: number } | null;
  province?: string | null;
  baseline_history?: [number, number][];
  trend?: { direction: "improving" | "steady" | "worsening"; change_pct: number; from_year: number; to_year: number } | null;
};

export type ProvinceRow = { name: string; sites: number; known_flares: number; mmscfd: number; value_usd_per_yr: number };

export type Impact = {
  co2e_t_per_yr: Range;
  co2e_t_per_yr_at_observed_dre: Range;
  power_mw: Range;
  value_usd_per_yr: Range;
  lng_cargoes_per_yr?: Range;
  homes_powered?: Range;
};

export type Totals = Impact & {
  sites_with_volume: number;
  bcm_per_yr: Range;
  mmscfd: Range;
  methods: string[];
};

export type Meta = {
  generated_at: string;
  sources: string[];
  firms_satellites: string[];
  calibration: string;
  site_count: number;
  notes: string[];
  totals?: Totals | null;
  observed_months?: string[];
  national_trend?: { year: number; bcm: number }[];
  new_sites?: string[];
  provinces?: ProvinceRow[];
  assumptions?: {
    lng_price_usd_per_mmbtu: number;
    lng_price_source: string;
    dre_regulatory: number;
    dre_observed: number;
    btu_per_scf: number;
  };
};

export type Timeline = { start: string; rows: [number, number, number][] };
