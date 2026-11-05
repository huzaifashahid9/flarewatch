"""Volume, emissions, value and power estimates, always with a range.

Three tiers, chosen per site:
1. "nightfire"  - Nightfire RH75 x John Zink calibration (licence needed)
2. "indicative" - World Bank annual baseline scaled by recent FIRMS brightness
3. "baseline"   - World Bank annual baseline only
FIRMS brightness alone is never converted to cubic metres; it is reported as
an activity index.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

from . import config

SCF_PER_M3 = 35.3147


@dataclass(frozen=True)
class Range:
    low: float
    mid: float
    high: float

    def scale(self, k: float) -> "Range":
        return Range(self.low * k, self.mid * k, self.high * k)


@dataclass(frozen=True)
class VolumeEstimate:
    bcm_per_yr: Range
    method: str  # "nightfire" | "indicative" | "baseline"
    extrapolated: bool = False
    note: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["mmscfd"] = asdict(mmscfd(self.bcm_per_yr))
        return d


def volume_from_rh75(rh75_mw: float,
                     cal: config.Calibration = config.ACTIVE_CALIBRATION) -> VolumeEstimate:
    if rh75_mw < 0:
        raise ValueError("radiant heat cannot be negative")
    mid = cal.slope_bcm_per_yr_per_mw * rh75_mw
    rng = Range(mid * (1 - cal.relative_error), mid, mid * (1 + cal.relative_error))
    return VolumeEstimate(rng, "nightfire", extrapolated=mid > cal.max_tested_bcm_per_yr,
                          note=f"calibration {cal.name}")


def volume_from_baseline(annual_bcm: float,
                         activity_ratio: Optional[float] = None) -> VolumeEstimate:
    """World Bank annual volume, optionally scaled by recent brightness.

    activity_ratio = recent mean FRP / the site's long-run mean FRP. This
    scaling is our own untested method, so it is labelled "indicative".
    """
    if annual_bcm < 0:
        raise ValueError("volume cannot be negative")
    if activity_ratio is None:
        rng = Range(annual_bcm * (1 + config.BASELINE_ERROR_LOW), annual_bcm,
                    annual_bcm * (1 + config.BASELINE_ERROR_HIGH))
        return VolumeEstimate(rng, "baseline", note="World Bank annual estimate")
    if activity_ratio < 0:
        raise ValueError("activity ratio cannot be negative")
    mid = annual_bcm * activity_ratio
    rng = Range(mid * (1 + config.INDICATIVE_ERROR_LOW), mid,
                mid * (1 + config.INDICATIVE_ERROR_HIGH))
    return VolumeEstimate(rng, "indicative",
                          note="World Bank baseline scaled by FIRMS brightness")


def mmscfd(bcm_per_yr: Range) -> Range:
    """BCM per year to million standard cubic feet per day."""
    k = config.M3_PER_BCM * SCF_PER_M3 / config.DAYS_PER_YEAR / 1e6
    return bcm_per_yr.scale(k)


def co2e_t_per_yr(bcm_per_yr: Range, dre: float = config.DRE_REGULATORY) -> Range:
    """CO2 from combustion plus CO2e of unburned methane.

    Both factors are anchored to World Bank totals at 98% efficiency and
    scaled to the chosen destruction efficiency.
    """
    if not 0 < dre <= 1:
        raise ValueError("destruction efficiency must be in (0, 1]")
    per_1000m3 = (config.CO2_T_PER_1000M3_AT_98 * dre / 0.98
                  + config.CH4_SLIP_TCO2E_PER_1000M3_AT_98 * (1 - dre) / 0.02)
    return bcm_per_yr.scale(config.M3_PER_BCM / 1000 * per_1000m3)


def power_mw(bcm_per_yr: Range) -> Range:
    """Continuous electric power the gas could generate (World Bank factor)."""
    return bcm_per_yr.scale(config.KWH_PER_BCM / config.HOURS_PER_YEAR / 1000)


def value_usd_per_yr(bcm_per_yr: Range, usd_per_mmbtu: float,
                     btu_per_scf: float = 1000.0) -> Range:
    """Gas value at a given price. btu_per_scf is an assumption (rich
    associated gas is often higher); it is exposed as a setting in the UI."""
    mmbtu_per_bcm = config.M3_PER_BCM * SCF_PER_M3 * btu_per_scf / 1e6
    return bcm_per_yr.scale(mmbtu_per_bcm * usd_per_mmbtu)
