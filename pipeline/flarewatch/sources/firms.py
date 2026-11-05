"""NASA FIRMS plug: nightly VIIRS hotspots from NOAA-20 and NOAA-21.

API: /api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{days}/{date}
Limit: 5,000 transactions per 10 minutes. The API sometimes returns HTTP 504,
so requests retry with backoff.
"""

from __future__ import annotations

import csv
import io
import time
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, List, Optional

import requests

from .. import config
from .base import Detection, SourceNotConfigured


def build_url(map_key: str, source: str, bbox=config.PAKISTAN_BBOX,
              days: int = 1, on: Optional[date] = None) -> str:
    if not 1 <= days <= 5:
        raise ValueError("FIRMS accepts 1 to 5 days per request")
    area = ",".join(f"{v:g}" for v in bbox)
    url = f"{config.FIRMS_API_BASE}/{map_key}/{source}/{area}/{days}"
    if on is not None:
        url += f"/{on.isoformat()}"
    return url


def parse_csv(text: str, source: str, night_only: bool = True) -> List[Detection]:
    """Turn a FIRMS VIIRS CSV into Detection objects."""
    rows = csv.DictReader(io.StringIO(text))
    out: List[Detection] = []
    for row in rows:
        if night_only and row.get("daynight", "N").strip().upper() != "N":
            continue
        hhmm = row["acq_time"].strip().zfill(4)
        observed = datetime.strptime(
            f"{row['acq_date'].strip()} {hhmm}", "%Y-%m-%d %H%M"
        ).replace(tzinfo=timezone.utc)
        frp = row.get("frp")
        out.append(
            Detection(
                lat=float(row["latitude"]),
                lon=float(row["longitude"]),
                observed_at=observed,
                satellite=row.get("satellite", source).strip(),
                source="firms",
                frp_mw=float(frp) if frp not in (None, "") else None,
                confidence=(row.get("confidence") or "").strip() or None,
            )
        )
    return out


def fetch_range(map_key: Optional[str], start: date, end: date,
                sources: Iterable[str] = config.FIRMS_ARCHIVE_SOURCES + config.FIRMS_SOURCES,
                session: Optional[requests.Session] = None) -> List[Detection]:
    """Backfill [start, end] in 5-day chunks. SP covers older dates and NRT the
    recent gap; duplicates are removed later by archive.merge. A chunk that a
    source does not cover just returns no rows."""
    if not map_key:
        raise SourceNotConfigured("Set FIRMS_MAP_KEY to fetch NASA FIRMS data")
    http = session or requests.Session()
    out: List[Detection] = []
    day = start
    while day <= end:
        span = min(5, (end - day).days + 1)
        for source in sources:
            out.extend(fetch(map_key, days=span, on=day, sources=[source], session=http))
        day += timedelta(days=span)
    return out


def fetch(map_key: Optional[str], days: int = 1, on: Optional[date] = None,
          sources: Iterable[str] = config.FIRMS_SOURCES,
          session: Optional[requests.Session] = None,
          retries: int = 4) -> List[Detection]:
    """Download and parse detections for Pakistan from every FIRMS source."""
    if not map_key:
        raise SourceNotConfigured("Set FIRMS_MAP_KEY to fetch NASA FIRMS data")
    http = session or requests.Session()
    detections: List[Detection] = []
    for source in sources:
        url = build_url(map_key, source, days=days, on=on)
        for attempt in range(retries + 1):
            resp = http.get(url, timeout=60)
            if resp.status_code == 200:
                text = resp.text
                if text.lstrip().lower().startswith("invalid"):
                    raise SourceNotConfigured(f"FIRMS rejected the key: {text[:80]}")
                detections.extend(parse_csv(text, source))
                break
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** (attempt + 1))
                continue
            resp.raise_for_status()
    return detections
