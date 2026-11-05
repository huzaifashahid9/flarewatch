"""Nightly pipeline entry point: fetch, cluster, filter, estimate, export.

Usage:
    FIRMS_MAP_KEY=... python -m flarewatch.run --days 1 --out ../data/static
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import archive, geo
from . import cluster as clustering
from . import config, estimate
from .sources import firms, nightfire, worldbank
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


def build_sites(detections: Sequence[Detection], baseline: Sequence[BaselineFlare],
                kilns: Sequence[Tuple[float, float]] = (),
                frp_history: Optional[Dict[str, float]] = None,
                public: bool = True) -> List[dict]:
    """public=True never uses VIIRS Nightfire values. The VNF academic
    licence forbids public machine-readable redistribution (1b) and public
    current-year volume estimates (1e), so Nightfire-based numbers go only to
    the private, non-public output."""
    frp_history = frp_history or {}
    sites = clustering.cluster(detections)
    observed_months = sorted({d.observed_at.strftime("%Y-%m") for d in detections})
    base = list(latest_baseline(baseline).values())
    out = []
    for s in sites:
        if clustering.near_any(s.lat, s.lon, kilns, config.KILN_EXCLUSION_RADIUS_M):
            continue
        cls, share = clustering.activity_class(s, observed_months)
        match = match_baseline(s, base)
        if cls == "sporadic" and match is None:
            # Seen in under a fifth of months and not a known flare: most
            # likely crop burning or another short-lived fire.
            continue
        frps = [d.frp_mw for d in s.detections if d.frp_mw is not None]
        mean_frp = float(np.mean(frps)) if frps else None
        rh = [d.rh75_mw for d in s.detections if d.rh75_mw is not None]
        vol: Optional[estimate.VolumeEstimate] = None
        if rh and not public:
            vol = estimate.volume_from_rh75(float(np.mean(rh)))
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
        }
        if vol is not None:
            site["impact"] = impact(vol.bcm_per_yr)
        out.append(site)
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


def write_outputs(sites: List[dict], out_dir: Path, sources_used: List[str],
                  notes: List[str], observed_months: Sequence[str] = ()) -> None:
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
        "assumptions": {
            "lng_price_usd_per_mmbtu": config.LNG_PRICE_USD_PER_MMBTU,
            "lng_price_source": config.LNG_PRICE_SOURCE,
            "dre_regulatory": config.DRE_REGULATORY,
            "dre_observed": config.DRE_OBSERVED,
            "btu_per_scf": 1000,
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
    args = p.parse_args(argv)

    notes: List[str] = []
    used: List[str] = []
    new: List[Detection] = []
    if nightfire.enabled():
        new += nightfire.fetch()
        used.append("viirs-nightfire")
    key = os.environ.get("FIRMS_MAP_KEY")
    new += firms.fetch(key, days=args.days)
    if args.backfill_days > 0:
        today = datetime.now(timezone.utc).date()
        new += firms.fetch_range(key, today - timedelta(days=args.backfill_days),
                                 today - timedelta(days=1))
    used.append("nasa-firms")
    new = geo.filter_detections(new)
    detections = archive.merge(geo.filter_detections(archive.load(args.archive)),
                               new, args.window_days)
    archive.save(args.archive, detections)
    try:
        baseline = worldbank.load(args.worldbank)
        used.append("world-bank-per-flare")
    except SourceNotConfigured as exc:
        baseline = []
        notes.append(str(exc))
    public_used = [u for u in used if u != "viirs-nightfire"]
    sites = build_sites(detections, baseline, public=True)
    months = sorted({d.observed_at.strftime("%Y-%m") for d in detections})
    write_outputs(sites, args.out, public_used, notes, months)
    if nightfire.enabled():
        private = build_sites(detections, baseline, public=False)
        write_outputs(private, args.private_out, used,
                      notes + ["Confidential - Not for Public Release (VIIRS Nightfire licence)"],
                      months)
    print(f"{len(new)} new detections, {len(detections)} in archive, "
          f"{len(sites)} sites -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
