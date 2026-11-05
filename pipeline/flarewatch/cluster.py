"""Group nightly detections into candidate flare sites and classify activity."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Sequence, Tuple

import numpy as np
from sklearn.cluster import DBSCAN

from . import config
from .sources.base import Detection

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = (np.sin((lat2 - lat1) / 2) ** 2
         + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


@dataclass
class Site:
    site_id: str
    lat: float
    lon: float
    detections: List[Detection] = field(default_factory=list)

    @property
    def nights(self) -> List[str]:
        return sorted({d.observed_at.date().isoformat() for d in self.detections})

    @property
    def active_months(self) -> List[str]:
        return sorted({d.observed_at.strftime("%Y-%m") for d in self.detections})

    @property
    def satellites(self) -> List[str]:
        return sorted({d.satellite for d in self.detections})


def cluster(detections: Sequence[Detection],
            radius_m: float = config.CLUSTER_RADIUS_M,
            min_detections: int = config.CLUSTER_MIN_DETECTIONS) -> List[Site]:
    if not detections:
        return []
    coords = np.radians([[d.lat, d.lon] for d in detections])
    labels = DBSCAN(eps=radius_m / EARTH_RADIUS_M, min_samples=min_detections,
                    metric="haversine", algorithm="ball_tree").fit(coords).labels_
    sites: List[Site] = []
    for label in sorted(set(labels) - {-1}):
        members = [d for d, lab in zip(detections, labels) if lab == label]
        lat = float(np.mean([d.lat for d in members]))
        lon = float(np.mean([d.lon for d in members]))
        sites.append(Site(site_id=f"PK-{lat:.4f}-{lon:.4f}", lat=lat, lon=lon,
                          detections=members))
    return sites


def activity_class(site: Site, observed_months: Sequence[str]) -> Tuple[str, float]:
    """Persistent / intermittent / sporadic by share of observed months active.

    `observed_months` should list only months with usable clear-sky passes;
    cloudy months count as missing, never as "no flare".
    """
    if not observed_months:
        return "unknown", 0.0
    share = len(set(site.active_months) & set(observed_months)) / len(set(observed_months))
    if len(set(observed_months)) < config.MIN_OBSERVED_MONTHS:
        # A few days of data cannot separate a flare from a crop fire.
        return "monitoring", share
    if share >= config.PERSISTENT_MIN_SHARE:
        return "persistent", share
    if share >= config.INTERMITTENT_MIN_SHARE:
        return "intermittent", share
    return "sporadic", share


def near_any(lat: float, lon: float, points: Sequence[Tuple[float, float]],
             radius_m: float) -> bool:
    if not points:
        return False
    arr = np.asarray(points, dtype=float)
    return bool(np.any(haversine_m(lat, lon, arr[:, 0], arr[:, 1]) <= radius_m))
