"""Pakistan boundary filter.

The FIRMS request uses a bounding box, which also covers parts of India,
Iran and Afghanistan. Every detection is checked against the Pakistan
polygon (Natural Earth 1:10m admin-0, public domain) before it is archived.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import List, Sequence

import numpy as np

BOUNDARY_PATH = Path(__file__).parent / "data" / "pakistan.geojson"


@lru_cache(maxsize=1)
def _rings() -> List[np.ndarray]:
    geom = json.loads(BOUNDARY_PATH.read_text())["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [np.asarray(ring, dtype=float) for poly in polys for ring in poly]


def _in_ring(lon: np.ndarray, lat: np.ndarray, ring: np.ndarray) -> np.ndarray:
    x1, y1 = ring[:-1, 0], ring[:-1, 1]
    x2, y2 = ring[1:, 0], ring[1:, 1]
    inside = np.zeros(lon.shape, dtype=bool)
    for a, b, c, d in zip(x1, y1, x2, y2):
        crosses = (b > lat) != (d > lat)
        with np.errstate(divide="ignore", invalid="ignore"):
            x_at = a + (lat - b) * (c - a) / (d - b)
        inside ^= crosses & (lon < x_at)
    return inside


def in_pakistan(lats: Sequence[float], lons: Sequence[float]) -> np.ndarray:
    lat = np.asarray(lats, dtype=float)
    lon = np.asarray(lons, dtype=float)
    result = np.zeros(lat.shape, dtype=bool)
    for ring in _rings():
        # Outer rings and holes both toggle, which is the even-odd rule.
        result ^= _in_ring(lon, lat, ring)
    return result


def filter_detections(detections):
    if not detections:
        return []
    mask = in_pakistan([d.lat for d in detections], [d.lon for d in detections])
    return [d for d, keep in zip(detections, mask) if keep]
