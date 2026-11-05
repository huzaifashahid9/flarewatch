"""The plug interface every data source implements.

FIRMS, the World Bank baseline and (later) VIIRS Nightfire are separate
plugs. Adding Nightfire when the licence arrives means adding one module
and switching a setting; nothing downstream changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class Detection:
    """One satellite hotspot on one overpass."""

    lat: float
    lon: float
    observed_at: datetime  # UTC
    satellite: str  # e.g. "N20", "N21"
    source: str  # plug name, e.g. "firms"
    frp_mw: Optional[float] = None  # FIRMS fire radiative power
    rh75_mw: Optional[float] = None  # Nightfire radiant heat, licence only
    temperature_k: Optional[float] = None  # Nightfire only
    confidence: Optional[str] = None


@dataclass(frozen=True)
class BaselineFlare:
    """Annual flared volume for one flare location (World Bank / EOG)."""

    lat: float
    lon: float
    year: int
    bcm: float
    flare_id: Optional[str] = None


class SourceNotConfigured(RuntimeError):
    """Raised when a plug lacks a key, file or licence."""
