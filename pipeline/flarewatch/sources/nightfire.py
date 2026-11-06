"""VIIRS Nightfire plug (Payne Institute EOG), academic licence.

EOG allows browser downloads under our licence; scripted downloads need
separate credentials. So this plug reads VNF V3.0 nightly CSVs that a team
member downloaded by hand into a private folder (FLAREWATCH_VNF_DIR,
default ../data/private/vnf). That folder is git-ignored and never deployed.

Nothing from this module may reach a public file: see run.public_only.
"""

from __future__ import annotations

import gzip
import io
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

import pandas as pd

from .. import config
from .base import Detection, SourceNotConfigured

NOTICE = ("This product was made utilizing VIIRS Nightfire (VNF) nightly data produced by "
          "the Earth Observation Group, Payne Institute for Public Policy, Colorado School of Mines.")
CONFIDENTIAL_NOTE = "Confidential - Not for Public Release (VIIRS Nightfire licence)"

MISSING = 999999
# VIIRS Cloud Mask: 0 confidently clear, 1 probably clear, 2 probably cloudy,
# 3 confidently cloudy. The calibration uses clear overpasses only.
CLEAR_CLOUD_MASK = {0, 1}
NIGHT_MIN_SOLAR_ZENITH = 97.0
USECOLS = ["Lat_GMTCO", "Lon_GMTCO", "Date_Mscan", "Temp_BB", "RH",
           "Cloud_Mask", "SOLZ_GMTCO"]


def enabled() -> bool:
    return os.environ.get("FLAREWATCH_USE_NIGHTFIRE") == "1"


def satellite_from_name(name: str) -> str:
    n = name.lower()
    if "_j01_" in n:
        return "N20"
    if "_j02_" in n:
        return "N21"
    if "_npp_" in n:
        return "NPP"
    return "unknown"


def parse_frame(df: pd.DataFrame, satellite: str,
                bbox=config.PAKISTAN_BBOX) -> List[Detection]:
    w, s, e, n = bbox
    df = df[(df["Lat_GMTCO"].between(s, n)) & (df["Lon_GMTCO"].between(w, e))]
    df = df[(df["RH"] < MISSING) & (df["RH"] > 0)]
    df = df[df["Cloud_Mask"].isin(CLEAR_CLOUD_MASK)]
    if "SOLZ_GMTCO" in df:
        df = df[df["SOLZ_GMTCO"] > NIGHT_MIN_SOLAR_ZENITH]
    out = []
    for r in df.itertuples(index=False):
        t = datetime.strptime(str(r.Date_Mscan)[:19], "%Y/%m/%d %H:%M:%S").replace(tzinfo=timezone.utc)
        temp = float(r.Temp_BB)
        out.append(Detection(
            lat=float(r.Lat_GMTCO), lon=float(r.Lon_GMTCO), observed_at=t,
            satellite=satellite, source="nightfire", rh_mw=float(r.RH),
            temperature_k=temp if temp < MISSING else None,
        ))
    return out


def read_file(path: Path) -> List[Detection]:
    raw = Path(path).read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    df = pd.read_csv(io.BytesIO(raw), usecols=lambda c: c in USECOLS)
    return parse_frame(df, satellite_from_name(Path(path).name))


def fetch(directory: Optional[Path] = None) -> List[Detection]:
    d = Path(directory or os.environ.get("FLAREWATCH_VNF_DIR", "../data/private/vnf"))
    files: Iterable[Path] = sorted(d.glob("VNF_*.csv*")) if d.exists() else []
    files = list(files)
    if not files:
        raise SourceNotConfigured(f"No VNF files in {d}; download nightly CSVs there by hand")
    out: List[Detection] = []
    for f in files:
        out.extend(read_file(f))
    return out
