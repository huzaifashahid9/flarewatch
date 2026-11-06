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
# Natural Earth 1:10m admin-1 (public domain). It predates the 2018 FATA
# merger and uses old spellings, so names are mapped to today's provinces.
PROVINCES_PATH = Path(__file__).parent / "data" / "provinces.geojson"
PROVINCE_NAMES = {
    "Northern Areas": "Gilgit-Baltistan", "K.P.": "Khyber Pakhtunkhwa",
    "F.A.T.A.": "Khyber Pakhtunkhwa", "Baluchistan": "Balochistan", "Punjab": "Punjab",
    "Sind": "Sindh", "Azad Kashmir": "Azad Kashmir", "F.C.T.": "Islamabad",
}


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


@lru_cache(maxsize=1)
def _province_rings():
    out = []
    for f in json.loads(PROVINCES_PATH.read_text())["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        name = PROVINCE_NAMES.get(f["properties"]["name"], f["properties"]["name"])
        out.append((name, [np.asarray(r, dtype=float) for poly in polys for r in poly]))
    return out


def province(lat: float, lon: float):
    """Province name for a point, or None if it falls outside every polygon
    (simplified borders can miss points right on a boundary)."""
    la, lo = np.array([lat]), np.array([lon])
    for name, rings in _province_rings():
        inside = np.zeros(1, dtype=bool)
        for ring in rings:
            inside ^= _in_ring(lo, la, ring)
        if inside[0]:
            return name
    return None
