"""Confidential VIIRS Nightfire summary for internal use and static slides.

Licence: VNF data may not be published in machine-readable form (1b), and
current-year volume or CO2 figures may only be shared marked Confidential (1e).
This writes a Markdown report to data/private/, which is git-ignored.

Usage: FLAREWATCH_VNF_DIR=../data/private/vnf python -m flarewatch.private_report
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from . import archive, geo, run
from . import cluster as clustering
from .sources import nightfire, worldbank
from .sources.base import SourceNotConfigured


def main() -> int:
    vnf = geo.filter_detections(nightfire.fetch())
    firms_dets = run.public_only(archive.load(Path("../data/archive/detections.csv")))
    try:
        baseline = worldbank.load(Path("../data/raw/worldbank_flares.xlsx"))
    except SourceNotConfigured:
        baseline = []
    sites = [s for s in run.build_sites(firms_dets + vnf, baseline, public=False)
             if s.get("vnf_temp_k")]
    # Volumes from the public World Bank file for comparison.
    pub_sites = [f["properties"] for f in json.loads(
        Path("../web/public/data/sites.geojson").read_text())["features"]]

    def public_match(s):
        best = min(pub_sites, key=lambda p: clustering.haversine_m(s["lat"], s["lon"], p["lat"], p["lon"]),
                   default=None)
        if best and clustering.haversine_m(s["lat"], s["lon"], best["lat"], best["lon"]) <= 1000:
            return best
        return {}
    days = sorted({d.observed_at.date().isoformat() for d in vnf})
    lines = [
        f"# {nightfire.CONFIDENTIAL_NOTE}", "",
        f"FlareWatch private Nightfire summary, Pakistan. VNF nights: {', '.join(days)}. "
        f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC.", "",
        "Volume = 0.0116 x RH75 (Zhizhin et al. 2026 preprint), mean over detected clear overpasses: "
        "the flow rate while burning, an upper bound on the yearly average. A single night is a snapshot, "
        "not an annual figure.", "",
        "| Site | Known WB flare | Temp (K) | Fingerprint | Overpasses | VNF rate (BCM/yr) | WB 2025 (BCM/yr) |",
        "|---|---|---|---|---|---|---|",
    ]
    for s in sorted(sites, key=lambda s: -(s["volume"]["bcm_per_yr"]["mid"] if s["volume"] else 0)):
        v = s["volume"]["bcm_per_yr"] if s["volume"] else None
        m = public_match(s)
        wb = m.get("volume")
        s["in_world_bank_catalogue"] = s["in_world_bank_catalogue"] or m.get("in_world_bank_catalogue", False)
        lines.append(
            f"| {s['id']} | {'yes' if s['in_world_bank_catalogue'] else 'no'} | {s['vnf_temp_k']} | "
            f"{s['temp_fingerprint']} | {s['vnf_overpasses']} | "
            f"{v['mid']:.4f} ({v['low']:.4f}-{v['high']:.4f}) |" if v else "| n/a |")
        if v:
            lines[-1] += f" {wb['bcm_per_yr']['mid']:.4f} |" if wb else " none |"
    lines += ["", nightfire.NOTICE,
              "Source: VIIRS Nightfire, Colorado School of Mines. Do not publish, share as data, or put online."]
    out = Path("../data/private/vnf_summary_CONFIDENTIAL.md")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n")
    print(f"{len(sites)} sites with Nightfire detections -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
