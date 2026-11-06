"""Nightly pipeline entry point: fetch, cluster, filter, estimate, export.

Usage:
    FIRMS_MAP_KEY=... python -m flarewatch.run --days 1 --out ../data/static
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from dataclasses import replace

import numpy as np

from . import archive, geo
from . import cluster as clustering
from . import config, estimate
from .sources import firms, nightfire, osm, worldbank
from .sources.base import BaselineFlare, Detection, SourceNotConfigured

BASELINE_MATCH_RADIUS_M = 1000.0


def latest_baseline(flares: Sequence[BaselineFlare]) -> Dict[Tuple[float, float], BaselineFlare]:
    best: Dict[Tuple[float, float], BaselineFlare] = {}
    for f in flares:
        key = (round(f.lat, 3), round(f.lon, 3))
        if key not in best or f.year > best[key].year:
            best[key] = f
    return best


def match_baseline(site: clustering.Site,
                   baseline: Sequence[BaselineFlare]) -> Optional[BaselineFlare]:
    if not baseline:
        return None
    lats = np.array([b.lat for b in baseline])
    lons = np.array([b.lon for b in baseline])
    dist = clustering.haversine_m(site.lat, site.lon, lats, lons)
    i = int(np.argmin(dist))
    return baseline[i] if dist[i] <= BASELINE_MATCH_RADIUS_M else None


TREND_LOOKBACK_YEARS = 3
TREND_STEADY_PCT = 15.0


def baseline_history(match: BaselineFlare, baseline: Sequence[BaselineFlare]) -> List[List[float]]:
    """Every World Bank year for the matched flare, as [year, bcm] pairs.
    Rows are the same flare when they share its id, or sit within the match
    radius when the file has no ids."""
    if match.flare_id:
        rows = [b for b in baseline if b.flare_id == match.flare_id]
    else:
        lats = np.array([b.lat for b in baseline])
        lons = np.array([b.lon for b in baseline])
        near = clustering.haversine_m(match.lat, match.lon, lats, lons) <= BASELINE_MATCH_RADIUS_M
        rows = [b for b, k in zip(baseline, near) if k]
    by_year: Dict[int, float] = {}
    for b in rows:
        by_year[b.year] = by_year.get(b.year, 0.0) + b.bcm
    return [[y, round(v, 5)] for y, v in sorted(by_year.items())]


def trend(history: Sequence[Sequence[float]]) -> Optional[dict]:
    """Latest World Bank year against the year TREND_LOOKBACK_YEARS earlier
    (or the earliest year on file). Within ±15% counts as steady, because the
    World Bank band itself is about -8%/+29%."""
    if len(history) < 2:
        return None
    to_y, to_v = history[-1]
    target = to_y - TREND_LOOKBACK_YEARS
    earlier = [h for h in history[:-1] if h[0] <= target] or [history[0]]
    from_y, from_v = earlier[-1]
    if from_v <= 0:
        return None
    pct = (to_v - from_v) / from_v * 100
    direction = "steady" if abs(pct) <= TREND_STEADY_PCT else ("improving" if pct < 0 else "worsening")
    return {"direction": direction, "change_pct": round(pct), "from_year": int(from_y), "to_year": int(to_y)}


def province_totals(sites: Sequence[dict]) -> List[dict]:
    """Sites and yearly gas value by province, worst first."""
    rows: Dict[str, dict] = {}
    for s in sites:
        name = s.get("province") or "Unknown"
        r = rows.setdefault(name, {"name": name, "sites": 0, "known_flares": 0,
                                   "mmscfd": 0.0, "value_usd_per_yr": 0.0})
        r["sites"] += 1
        if s.get("in_world_bank_catalogue"):
            r["known_flares"] += 1
        if s.get("volume"):
            r["mmscfd"] += s["volume"]["mmscfd"]["mid"]
        if s.get("impact"):
            r["value_usd_per_yr"] += s["impact"]["value_usd_per_yr"]["mid"]
    for r in rows.values():
        r["mmscfd"] = round(r["mmscfd"], 2)
        r["value_usd_per_yr"] = round(r["value_usd_per_yr"])
    return sorted(rows.values(), key=lambda r: (-r["value_usd_per_yr"], -r["sites"]))


NEAREST_FIELD_MAX_KM = 15.0
NEW_SITE_DAYS = 14
NEW_SITE_MIN_NIGHTS = 5


def load_operators(path: Path) -> List[Tuple[re.Pattern, str]]:
    """Field name pattern -> operator company, from public sources (company
    reports and press). This names the operator of the nearest field; it is
    not the official licence-block boundary."""
    path = Path(path)
    if not path.exists():
        return []
    import csv
    with path.open(newline="") as fh:
        return [(re.compile(r["pattern"], re.IGNORECASE), r["operator"]) for r in csv.DictReader(fh)]


def operator_for(name: str, operators: Sequence[Tuple[re.Pattern, str]]) -> Optional[str]:
    return next((op for pat, op in operators if pat.search(name)), None)


def nearest_field(lat: float, lon: float, fields: Sequence[dict],
                  operators: Sequence[Tuple[re.Pattern, str]] = ()) -> Optional[dict]:
    if not fields:
        return None
    d = clustering.haversine_m(lat, lon, np.array([f["lat"] for f in fields]),
                               np.array([f["lon"] for f in fields]))
    i = int(np.argmin(d))
    if d[i] > NEAREST_FIELD_MAX_KM * 1000:
        return None
    f = fields[i]
    operator = f.get("operator") or operator_for(f["name"], operators)
    return {"name": f["name"], "operator": operator, "km": round(float(d[i]) / 1000, 1)}


def build_sites(detections: Sequence[Detection], baseline: Sequence[BaselineFlare],
                kilns: Sequence[Tuple[float, float]] = (),
                frp_history: Optional[Dict[str, float]] = None,
                public: bool = True, fields: Sequence[dict] = (),
                operators: Sequence[Tuple[re.Pattern, str]] = ()) -> List[dict]:
    """public=True never uses VIIRS Nightfire values. The VNF academic
    licence forbids public machine-readable redistribution (1b) and public
    current-year volume estimates (1e), so Nightfire-based numbers go only to
    the private, non-public output."""
    frp_history = frp_history or {}
    sites = clustering.cluster(detections)
    latest = max((d.observed_at.date() for d in detections), default=datetime.now(timezone.utc).date())
    new_cutoff = (latest - timedelta(days=NEW_SITE_DAYS)).isoformat()
    still_cutoff = (latest - timedelta(days=3)).isoformat()
    observed_months = sorted({d.observed_at.strftime("%Y-%m") for d in detections})
    base = list(latest_baseline(baseline).values())
    out = []
    for s in sites:
        if clustering.near_any(s.lat, s.lon, kilns, config.KILN_EXCLUSION_RADIUS_M):
            continue
        cls, share = clustering.activity_class(s, observed_months)
        match = match_baseline(s, base)
        recent = s.nights[0] >= new_cutoff
        still_burning = s.nights[-1] >= still_cutoff
        if (recent and still_burning and len(s.nights) >= NEW_SITE_MIN_NIGHTS
                and match is None and cls != "persistent"):
            # First seen in the last two weeks, back on many nights and still
            # burning: a possible new flare. Crop fires usually stop within a
            # few days, so they fail the night count or the still-burning test.
            cls = "new"
        elif cls == "sporadic" and match is None:
            # Seen in under a fifth of months and not a known flare: most
            # likely crop burning or another short-lived fire.
            continue
        frps = [d.frp_mw for d in s.detections if d.frp_mw is not None]
        mean_frp = float(np.mean(frps)) if frps else None
        rh75 = overpass_rh75([d for d in s.detections if d.rh_mw is not None])
        vol: Optional[estimate.VolumeEstimate] = None
        if rh75 and not public:
            # Mean flow rate over the clear overpasses where the flare was
            # detected. The preprint also counts clear overpasses with no
            # detection as zero; we cannot see those in detection files, so
            # this is the rate while burning (an upper bound on the average).
            vol = estimate.volume_from_rh75(float(np.mean(list(rh75.values()))))
            vol = replace(vol, note=vol.note + "; rate while burning, clear overpasses only")
        elif match is not None:
            hist = frp_history.get(s.site_id)
            ratio = (mean_frp / hist) if (mean_frp and hist) else None
            vol = estimate.volume_from_baseline(match.bcm, ratio)
        site = {
            "id": s.site_id, "lat": round(s.lat, 5), "lon": round(s.lon, 5),
            "activity_class": cls, "active_share": round(share, 3),
            "nights_detected": len(s.nights), "last_seen": s.nights[-1],
            "satellites": s.satellites, "mean_frp_mw": mean_frp,
            "baseline_year": match.year if match else None,
            "in_world_bank_catalogue": match is not None,
            "volume": vol.to_dict() if vol else None,
            # Nights detected in each observed month, aligned with
            # meta.observed_months, for the activity chart.
            "monthly_nights": monthly_nights(s, observed_months),
            "first_seen": s.nights[0],
            "nearest_field": nearest_field(s.lat, s.lon, fields, operators),
            "province": geo.province(s.lat, s.lon),
        }
        if match is not None:
            hist = baseline_history(match, baseline)
            site["baseline_history"] = hist
            site["trend"] = trend(hist)
        if vol is not None:
            site["impact"] = impact(vol.bcm_per_yr)
        temps = [d.temperature_k for d in s.detections if d.temperature_k]
        if temps and not public:
            t = float(np.median(temps))
            site["vnf_temp_k"] = round(t)
            site["vnf_overpasses"] = len(rh75)
            site["temp_fingerprint"] = "gas flare" if t >= config.FLARE_MIN_TEMP_K else "cooler source (industry or fire)"
        out.append(site)
    return out


def public_only(detections: Sequence[Detection]) -> List[Detection]:
    """Drop anything derived from VIIRS Nightfire before it can reach a public file."""
    return [d for d in detections if d.source != "nightfire" and d.rh_mw is None]


OVERPASS_GAP = timedelta(minutes=10)


def overpass_rh75(dets: Sequence[Detection]) -> Dict[Tuple[str, str], float]:
    """RH75 per satellite overpass (Zhizhin et al. 2026, Eqs. 2-3): the sum of
    radiant heat over pixels above 75% of that overpass's brightest pixel."""
    out: Dict[Tuple[str, str], float] = {}
    by_sat: Dict[str, List[Detection]] = {}
    for d in dets:
        by_sat.setdefault(d.satellite, []).append(d)
    for sat, ds in by_sat.items():
        ds.sort(key=lambda d: d.observed_at)
        group: List[Detection] = []
        def flush():
            if group:
                peak = max(g.rh_mw for g in group)
                out[(sat, group[0].observed_at.isoformat())] = sum(
                    g.rh_mw for g in group if g.rh_mw > 0.75 * peak)
        for d in ds:
            if group and d.observed_at - group[-1].observed_at > OVERPASS_GAP:
                flush()
                group = []
            group.append(d)
        flush()
    return out


def monthly_nights(site: clustering.Site, months: Sequence[str]) -> List[int]:
    counts: Dict[str, int] = {}
    for night in site.nights:
        counts[night[:7]] = counts.get(night[:7], 0) + 1
    return [counts.get(m, 0) for m in months]


def _r(r: estimate.Range, nd: int = 0) -> dict:
    return {"low": round(r.low, nd), "mid": round(r.mid, nd), "high": round(r.high, nd)}


def impact(bcm: estimate.Range) -> dict:
    """What the flared gas means in CO2, power and money, each with its range."""
    return {
        "co2e_t_per_yr": _r(estimate.co2e_t_per_yr(bcm)),
        "co2e_t_per_yr_at_observed_dre": _r(estimate.co2e_t_per_yr(bcm, config.DRE_OBSERVED)),
        "power_mw": _r(estimate.power_mw(bcm), 1),
        "value_usd_per_yr": _r(estimate.value_usd_per_yr(bcm, config.LNG_PRICE_USD_PER_MMBTU)),
        "lng_cargoes_per_yr": _r(bcm.scale(estimate.SCF_PER_M3 * config.M3_PER_BCM * 1000 / 1e6
                                           / config.MMBTU_PER_LNG_CARGO), 2),
        "homes_powered": _r(estimate.power_mw(bcm).scale(1000 * config.HOURS_PER_YEAR
                                                         / config.KWH_PER_HOME_PER_YEAR)),
    }


def totals(sites: Sequence[dict]) -> Optional[dict]:
    """National totals over sites with a volume. Lows and highs are summed,
    which is the widest honest band (errors are not assumed to cancel)."""
    with_vol = [s for s in sites if s.get("volume")]
    if not with_vol:
        return None
    def add(get):
        rs = [get(s) for s in with_vol]
        return estimate.Range(sum(r["low"] for r in rs), sum(r["mid"] for r in rs),
                              sum(r["high"] for r in rs))
    bcm = add(lambda s: s["volume"]["bcm_per_yr"])
    return {
        "sites_with_volume": len(with_vol),
        "bcm_per_yr": _r(bcm, 4),
        "mmscfd": _r(estimate.mmscfd(bcm), 1),
        **impact(bcm),
        "methods": sorted({s["volume"]["method"] for s in with_vol}),
    }


def national_trend(baseline: Sequence[BaselineFlare]) -> List[dict]:
    """Pakistan's yearly flared volume from the World Bank per-flare file."""
    years: Dict[int, float] = {}
    for f in baseline:
        years[f.year] = years.get(f.year, 0.0) + f.bcm
    return [{"year": y, "bcm": round(v, 4)} for y, v in sorted(years.items())]


def write_timeline(detections: Sequence[Detection], out_dir: Path) -> None:
    """Compact nightly FIRMS detections for the time-lapse: one row per
    detection as [day index, lat, lon]. FIRMS data is open; never pass
    Nightfire rows here."""
    dets = public_only(detections)
    if not dets:
        return
    start = min(d.observed_at.date() for d in dets)
    rows = sorted({((d.observed_at.date() - start).days, round(d.lat, 3), round(d.lon, 3))
                   for d in dets})
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "timeline.json").write_text(json.dumps(
        {"start": start.isoformat(), "rows": [list(r) for r in rows]}, separators=(",", ":")))


def new_sites(sites: Sequence[dict], today=None, days: int = NEW_SITE_DAYS) -> List[str]:
    """Sites first seen within the last `days` days of a one-year archive."""
    today = today or datetime.now(timezone.utc).date()
    cutoff = (today - timedelta(days=days)).isoformat()
    return [s["id"] for s in sites if s["activity_class"] == "new" and s["first_seen"] >= cutoff]


def write_outputs(sites: List[dict], out_dir: Path, sources_used: List[str],
                  notes: List[str], observed_months: Sequence[str] = (),
                  trend: Sequence[dict] = ()) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    features = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
        "properties": s,
    } for s in sites]
    (out_dir / "sites.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": features}))
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources_used, "firms_satellites": list(config.FIRMS_SOURCES),
        "calibration": config.ACTIVE_CALIBRATION.name,
        "site_count": len(sites), "notes": notes,
        "totals": totals(sites),
        "observed_months": list(observed_months),
        "national_trend": list(trend),
        "new_sites": new_sites(sites),
        "provinces": province_totals(sites),
        "assumptions": {
            "lng_price_usd_per_mmbtu": config.LNG_PRICE_USD_PER_MMBTU,
            "lng_price_source": config.LNG_PRICE_SOURCE,
            "dre_regulatory": config.DRE_REGULATORY,
            "dre_observed": config.DRE_OBSERVED,
            "btu_per_scf": 1000,
            "mmbtu_per_lng_cargo": config.MMBTU_PER_LNG_CARGO,
            "kwh_per_home_per_year": config.KWH_PER_HOME_PER_YEAR,
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=1)
    p.add_argument("--out", type=Path, default=Path("../web/public/data"))
    p.add_argument("--worldbank", type=Path, default=Path("../data/raw/worldbank_flares.xlsx"))
    p.add_argument("--archive", type=Path, default=Path("../data/archive/detections.csv"))
    p.add_argument("--window-days", type=int, default=365)
    p.add_argument("--backfill-days", type=int, default=0,
                   help="Also fetch this many past days from the FIRMS archive")
    p.add_argument("--private-out", type=Path, default=Path("../data/private"))
    p.add_argument("--osm-cache", type=Path, default=Path("../data/reference/osm_oil_gas.json"))
    p.add_argument("--operators", type=Path, default=Path("../data/reference/field_operators.csv"))
    args = p.parse_args(argv)

    notes: List[str] = []
    used: List[str] = ["nasa-firms"]
    key = os.environ.get("FIRMS_MAP_KEY")
    new = firms.fetch(key, days=args.days)
    if args.backfill_days > 0:
        today = datetime.now(timezone.utc).date()
        new += firms.fetch_range(key, today - timedelta(days=args.backfill_days),
                                 today - timedelta(days=1))
    new = public_only(geo.filter_detections(new))
    # The public archive is committed to a public repo, so it holds FIRMS
    # detections only. Nightfire rows never go into it (VNF licence 1b).
    detections = archive.merge(public_only(geo.filter_detections(archive.load(args.archive))),
                               new, args.window_days)
    archive.save(args.archive, detections)
    try:
        baseline = worldbank.load(args.worldbank)
        used.append("world-bank-per-flare")
    except SourceNotConfigured as exc:
        baseline = []
        notes.append(str(exc))
    # Older caches predate the name filter, so filter again here.
    fields = [f for f in osm.load_or_fetch(args.osm_cache) if osm.is_flare_candidate(f["name"])]
    operators = load_operators(args.operators)
    if fields:
        used.append("openstreetmap")
    sites = build_sites(detections, baseline, public=True, fields=fields, operators=operators)
    months = sorted({d.observed_at.strftime("%Y-%m") for d in detections})
    write_outputs(sites, args.out, used, notes, months, national_trend(baseline))
    write_timeline(detections, args.out)
    if nightfire.enabled():
        # Private path only: data/private is git-ignored and never deployed.
        vnf_archive = args.private_out / "nightfire_archive.csv"
        vnf = archive.merge(archive.load(vnf_archive),
                            geo.filter_detections(nightfire.fetch()), args.window_days)
        archive.save(vnf_archive, vnf)
        private = build_sites(detections + vnf, baseline, public=False)
        write_outputs(private, args.private_out, used + ["viirs-nightfire"],
                      notes + [nightfire.CONFIDENTIAL_NOTE, nightfire.NOTICE], months)
    print(f"{len(new)} new detections, {len(detections)} in archive, "
          f"{len(sites)} sites -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
