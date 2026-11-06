"""Named oil and gas features in Pakistan from OpenStreetMap (ODbL).

Satellites see heat, not owners. OpenStreetMap has many named gas fields,
plants and wells, which gives each flare a "nearest named field". This is a
hint, not a legal licence-block match. Attribution: (c) OpenStreetMap contributors.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import List, Optional

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
QUERY = """
[out:json][timeout:120];
area["ISO3166-1"="PK"][admin_level=2]->.pk;
(
  nwr["industrial"~"^(oil|gas|oil;gas|gas;oil)$"](area.pk);
  nwr["man_made"~"^(petroleum_well|flare)$"]["name"](area.pk);
  nwr["landuse"="industrial"]["name"~"[Gg]as|[Oo]il|[Pp]etrol|[Rr]efiner"](area.pk);
  nwr["name"~"[Gg]as [Ff]ield|[Oo]il [Ff]ield|[Oo]ilfield|[Gg]as [Pp]lant|[Gg]as [Pp]rocessing|[Rr]efinery"](area.pk);
);
out center tags;
"""


# The name searches also catch cooking-oil mills, petrol pumps, depots and
# lube shops. None of these flare gas, so they are dropped.
NOT_A_FLARE_SITE = re.compile(
    r"mill|ginning|cotton|agro|petrol pump|lubricant|depot|depo\b|terminal|autos|spare|trader|chakki|"
    r"colony|housing|road|runway|boiler|power station|power plant|\bmil\b|filling|custody|linde|oil change|talron|kausar|haroon",
    re.IGNORECASE)


def is_flare_candidate(name: str) -> bool:
    return not NOT_A_FLARE_SITE.search(name)


def parse(payload: dict) -> List[dict]:
    out, seen = [], set()
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name:en") or tags.get("name")
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if not name or lat is None or lon is None or not is_flare_candidate(name):
            continue
        key = (name, round(lat, 2), round(lon, 2))
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "lat": round(lat, 5), "lon": round(lon, 5),
                    "operator": tags.get("operator"),
                    "kind": tags.get("industrial") or tags.get("man_made") or tags.get("landuse")})
    return out


def load_or_fetch(cache: Path, max_age_days: int = 7,
                  session: Optional[requests.Session] = None) -> List[dict]:
    """Refresh the cache weekly; on any failure keep using the old cache."""
    cache = Path(cache)
    fresh = cache.exists() and (time.time() - cache.stat().st_mtime) < max_age_days * 86400
    if not fresh:
        try:
            r = (session or requests).post(OVERPASS_URL, data={"data": QUERY}, timeout=180,
                                           headers={"User-Agent": "FlareWatch/1.0 (hackathon project)"})
            r.raise_for_status()
            features = parse(r.json())
            if features:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(features, indent=0))
                return features
        except (requests.RequestException, ValueError):
            pass
    return json.loads(cache.read_text()) if cache.exists() else []
