"""Rolling archive of detections, so persistence is judged over months, not one night."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Sequence

import pandas as pd

from .sources.base import Detection

COLUMNS = ["lat", "lon", "observed_at", "satellite", "source", "frp_mw",
           "rh75_mw", "temperature_k", "confidence"]


def load(path: Path) -> List[Detection]:
    if not Path(path).exists():
        return []
    df = pd.read_csv(path, parse_dates=["observed_at"])
    out = []
    for r in df.itertuples(index=False):
        def opt(v):
            return None if pd.isna(v) else v
        out.append(Detection(
            lat=float(r.lat), lon=float(r.lon),
            observed_at=r.observed_at.to_pydatetime().astimezone(timezone.utc),
            satellite=str(r.satellite), source=str(r.source),
            frp_mw=opt(r.frp_mw), rh75_mw=opt(r.rh75_mw),
            temperature_k=opt(r.temperature_k),
            confidence=None if pd.isna(r.confidence) else str(r.confidence),
        ))
    return out


def merge(old: Sequence[Detection], new: Sequence[Detection], window_days: int,
          now: datetime | None = None) -> List[Detection]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)
    seen = {}
    for d in list(old) + list(new):
        if d.observed_at < cutoff:
            continue
        key = (round(d.lat, 4), round(d.lon, 4), d.observed_at.isoformat(), d.satellite)
        seen[key] = d
    return sorted(seen.values(), key=lambda d: d.observed_at)


def save(path: Path, detections: Sequence[Detection]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    rows = [asdict(d) for d in detections]
    pd.DataFrame(rows, columns=COLUMNS).to_csv(path, index=False)
