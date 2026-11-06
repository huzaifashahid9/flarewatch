"""People living near each flare, from WorldPop.

WorldPop 2020 constrained-free estimates at 1 km for Pakistan, CC BY 4.0
(www.worldpop.org). The GeoTIFF is downloaded once into data/reference and
reused. If it cannot be loaded, the pipeline carries on without this field.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import requests

WORLDPOP_URL = ("https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/PAK/"
                "pak_ppp_2020_1km_Aggregated.tif")
ATTRIBUTION = "WorldPop 2020 (www.worldpop.org), CC BY 4.0"
KM_PER_DEG_LAT = 111.32


class PopulationGrid:
    """A population raster in lat/lon (EPSG:4326), one value per cell."""

    def __init__(self, values: np.ndarray, west: float, north: float, cell_deg: float):
        self.values = np.where(np.isfinite(values) & (values > 0), values, 0.0)
        self.west, self.north, self.cell = west, north, cell_deg

    @classmethod
    def from_geotiff(cls, path: Path) -> "PopulationGrid":
        import rasterio  # only needed when the raster is used

        with rasterio.open(path) as src:
            arr = src.read(1).astype(float)
            if src.nodata is not None:
                arr[arr == src.nodata] = 0.0
            t = src.transform
            return cls(arr, west=t.c, north=t.f, cell_deg=t.a)

    def people_within(self, lat: float, lon: float, km: float) -> int:
        """Sum of cells whose centre lies within `km` of the point."""
        dlat = km / KM_PER_DEG_LAT
        dlon = km / (KM_PER_DEG_LAT * max(np.cos(np.radians(lat)), 1e-6))
        r0 = max(int((self.north - (lat + dlat)) / self.cell), 0)
        r1 = min(int((self.north - (lat - dlat)) / self.cell) + 1, self.values.shape[0])
        c0 = max(int(((lon - dlon) - self.west) / self.cell), 0)
        c1 = min(int(((lon + dlon) - self.west) / self.cell) + 1, self.values.shape[1])
        if r0 >= r1 or c0 >= c1:
            return 0
        rows = self.north - (np.arange(r0, r1) + 0.5) * self.cell
        cols = self.west + (np.arange(c0, c1) + 0.5) * self.cell
        la, lo = np.meshgrid(rows, cols, indexing="ij")
        dy = (la - lat) * KM_PER_DEG_LAT
        dx = (lo - lon) * KM_PER_DEG_LAT * np.cos(np.radians(lat))
        inside = dx * dx + dy * dy <= km * km
        return int(round(float(self.values[r0:r1, c0:c1][inside].sum())))


def load(path: Path, url: str = WORLDPOP_URL) -> Optional[PopulationGrid]:
    path = Path(path)
    try:
        if not path.exists():
            r = requests.get(url, timeout=120)
            r.raise_for_status()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(r.content)
        return PopulationGrid.from_geotiff(path)
    except Exception as exc:  # network or format problem: skip the field
        print(f"WorldPop not loaded: {exc}")
        return None
