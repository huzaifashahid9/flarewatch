"""World Bank / EOG plug: annual flared volume per flare location, 2012-2025.

Free download (CC BY 4.0):
https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-0400072026/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx

The column names have not been checked against the real file yet, so the
loader looks for likely names and fails loudly if it cannot find them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd

from .. import config
from .base import BaselineFlare, SourceNotConfigured

DOWNLOAD_URL = (
    "https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-"
    "0400072026/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx"
)

LAT_NAMES = ("latitude", "lat", "lat_gmtco")
LON_NAMES = ("longitude", "lon", "long", "lon_gmtco")
YEAR_NAMES = ("year", "yr")
BCM_NAMES = ("bcm", "flare volume (bcm)", "volume (bcm)", "bcm_est", "volume_bcm")
COUNTRY_NAMES = ("country", "country name", "cntry_name", "iso", "country_name")
ID_NAMES = ("id", "flare_id", "id_number", "site_id")


def _find(columns: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    lowered = {c.strip().lower(): c for c in columns}
    for name in candidates:
        if name in lowered:
            return lowered[name]
    return None


def from_frame(df: pd.DataFrame, country: str = "Pakistan",
               bbox=config.PAKISTAN_BBOX) -> List[BaselineFlare]:
    lat = _find(df.columns, LAT_NAMES)
    lon = _find(df.columns, LON_NAMES)
    year = _find(df.columns, YEAR_NAMES)
    bcm = _find(df.columns, BCM_NAMES)
    if not all((lat, lon, year, bcm)):
        raise SourceNotConfigured(
            "World Bank file columns not recognised; found "
            f"{list(df.columns)}. Update the *_NAMES lists in worldbank.py."
        )
    ctry = _find(df.columns, COUNTRY_NAMES)
    fid = _find(df.columns, ID_NAMES)
    if ctry is not None:
        df = df[df[ctry].astype(str).str.strip().str.lower() == country.lower()]
    west, south, east, north = bbox
    df = df[df[lat].between(south, north) & df[lon].between(west, east)]
    return [
        BaselineFlare(
            lat=float(r[lat]), lon=float(r[lon]), year=int(r[year]),
            bcm=float(r[bcm]), flare_id=str(r[fid]) if fid else None,
        )
        for _, r in df.iterrows()
        if pd.notna(r[bcm])
    ]


def load(path: Path, country: str = "Pakistan") -> List[BaselineFlare]:
    if not Path(path).exists():
        raise SourceNotConfigured(f"Download the World Bank file to {path}: {DOWNLOAD_URL}")
    sheets = pd.read_excel(path, sheet_name=None)
    errors = []
    for name, frame in sheets.items():
        try:
            return from_frame(frame, country=country)
        except SourceNotConfigured as exc:
            errors.append(f"{name}: {exc}")
    raise SourceNotConfigured("No usable sheet. " + " | ".join(errors))
