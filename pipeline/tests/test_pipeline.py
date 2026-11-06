"""Tests run on synthetic fixtures only (tests/fixtures), never real data."""

from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from flarewatch import config, estimate, run
from flarewatch.cluster import activity_class, cluster, near_any
from flarewatch.sources import firms, worldbank
from flarewatch.sources.base import SourceNotConfigured

FIXTURE = Path(__file__).parent / "fixtures" / "firms_sample.csv"


def detections():
    return firms.parse_csv(FIXTURE.read_text(), "VIIRS_NOAA20_NRT")


def test_url_uses_noaa_and_bbox():
    url = firms.build_url("KEY", "VIIRS_NOAA21_NRT", days=2, on=date(2026, 11, 3))
    assert url.endswith("/KEY/VIIRS_NOAA21_NRT/60.8,23.6,77.9,37.1/2/2026-11-03")
    assert "SNPP" not in "".join(config.FIRMS_SOURCES)


def test_url_rejects_more_than_five_days():
    with pytest.raises(ValueError):
        firms.build_url("KEY", "VIIRS_NOAA20_NRT", days=6)


def test_parse_keeps_night_only():
    d = detections()
    assert len(d) == 5
    assert all(x.observed_at.tzinfo is not None for x in d)


def test_fetch_without_key_is_not_configured():
    with pytest.raises(SourceNotConfigured):
        firms.fetch(None)


def test_cluster_groups_repeat_hotspot_and_drops_single():
    sites = cluster(detections())
    assert len(sites) == 1
    assert sites[0].satellites == ["N20", "N21"]
    assert len(sites[0].nights) == 3


def test_activity_classes():
    site = cluster(detections())[0]
    assert activity_class(site, ["2026-11"])[0] == "monitoring"
    assert activity_class(site, ["2026-08", "2026-09", "2026-10", "2026-11"])[0] == "intermittent"
    months = [f"2026-{m:02d}" for m in range(1, 12)]
    assert activity_class(site, months)[0] == "sporadic"
    assert activity_class(site, [])[0] == "unknown"


def test_kiln_mask():
    assert near_any(27.7005, 68.8003, [(27.7006, 68.8004)], 300)
    assert not near_any(27.7005, 68.8003, [(27.8, 68.9)], 300)
    sites = run.build_sites(detections(), [], kilns=[(27.7005, 68.8003)])
    assert sites == []


def test_nightfire_volume_and_band():
    v = estimate.volume_from_rh75(10.0)
    assert v.bcm_per_yr.mid == pytest.approx(0.116)
    assert v.bcm_per_yr.low == pytest.approx(0.1044)
    assert v.extrapolated is False
    assert estimate.volume_from_rh75(100.0).extrapolated is True


def test_baseline_and_indicative_labels():
    b = estimate.volume_from_baseline(0.05)
    assert b.method == "baseline"
    assert b.bcm_per_yr.high == pytest.approx(0.05 * 1.29)
    i = estimate.volume_from_baseline(0.05, activity_ratio=2.0)
    assert i.method == "indicative" and i.bcm_per_yr.mid == pytest.approx(0.10)


def test_emissions_match_world_bank_factor_at_98():
    r = estimate.co2e_t_per_yr(estimate.Range(1, 1, 1))
    assert r.mid == pytest.approx(2.57e6)
    worse = estimate.co2e_t_per_yr(estimate.Range(1, 1, 1), dre=config.DRE_OBSERVED)
    assert worse.mid > r.mid


def test_power_and_units():
    assert estimate.power_mw(estimate.Range(1, 1, 1)).mid == pytest.approx(456.6, rel=1e-3)
    assert estimate.mmscfd(estimate.Range(1, 1, 1)).mid == pytest.approx(96.75, rel=1e-3)


def test_worldbank_frame_filters_to_pakistan():
    df = pd.DataFrame({
        "Country": ["Pakistan", "Pakistan", "Iran"],
        "Latitude": [27.7, 27.7, 30.0], "Longitude": [68.8, 68.8, 50.0],
        "Year": [2024, 2025, 2025], "BCM": [0.04, 0.05, 1.0],
    })
    flares = worldbank.from_frame(df)
    assert len(flares) == 2
    sites = run.build_sites(detections(), flares)
    assert sites[0]["volume"]["method"] == "baseline"
    assert sites[0]["baseline_year"] == 2025


def test_worldbank_unknown_columns_fail_loudly():
    with pytest.raises(SourceNotConfigured):
        worldbank.from_frame(pd.DataFrame({"a": [1]}))


def test_outputs_written(tmp_path):
    sites = run.build_sites(detections(), [])
    run.write_outputs(sites, tmp_path, ["nasa-firms"], [])
    assert (tmp_path / "sites.geojson").exists()
    assert (tmp_path / "meta.json").exists()


def test_archive_roundtrip_and_dedupe(tmp_path):
    from datetime import datetime, timezone
    from flarewatch import archive
    d = detections()
    now = datetime(2026, 11, 5, tzinfo=timezone.utc)
    merged = archive.merge(d, d, window_days=30, now=now)
    assert len(merged) == len(d)
    path = tmp_path / "a.csv"
    archive.save(path, merged)
    back = archive.load(path)
    assert len(back) == len(d) and back[0].observed_at.tzinfo is not None
    assert archive.merge(back, [], window_days=1, now=now) == []


def test_public_output_never_uses_nightfire():
    from dataclasses import replace
    d = [replace(x, rh_mw=10.0) for x in detections()]
    public = run.build_sites(d, [], public=True)
    assert public[0]["volume"] is None
    private = run.build_sites(d, [], public=False)
    assert private[0]["volume"]["method"] == "nightfire"


def test_pakistan_boundary_excludes_neighbours():
    from flarewatch import geo
    #           Sui gas field, Karachi, Delhi (India), Zahedan (Iran), Kandahar (Afg)
    lats = [28.64, 24.86, 28.61, 29.50, 31.61]
    lons = [69.18, 67.01, 77.21, 60.86, 65.71]
    assert geo.in_pakistan(lats, lons).tolist() == [True, True, False, False, False]


def test_sporadic_unknown_fires_are_dropped():
    months = [f"2026-{m:02d}" for m in range(1, 12)]
    from flarewatch.sources.base import Detection
    from datetime import datetime, timezone
    # One extra detection elsewhere per month so 11 months count as observed.
    filler = [Detection(30.0 + m / 10, 70.0, datetime(2026, m, 1, 21, tzinfo=timezone.utc),
                        "N20", "firms") for m in range(1, 12)]
    assert run.build_sites(detections() + filler, []) == []


def test_impact_and_totals():
    imp = run.impact(estimate.Range(0.9, 1.0, 1.1))
    assert imp["co2e_t_per_yr"]["mid"] == pytest.approx(2.57e6, rel=1e-3)
    assert imp["co2e_t_per_yr_at_observed_dre"]["mid"] > imp["co2e_t_per_yr"]["mid"]
    # 1 BCM = 35.3 million MMBtu at 1000 Btu/scf
    assert imp["value_usd_per_yr"]["mid"] == pytest.approx(35.3147e6 * 18.4, rel=1e-3)
    sites = [{"volume": {"bcm_per_yr": {"low": 1, "mid": 2, "high": 3}, "method": "baseline"}},
             {"volume": None}]
    t = run.totals(sites)
    assert t["sites_with_volume"] == 1 and t["bcm_per_yr"]["mid"] == 2
    assert run.totals([{"volume": None}]) is None


def test_monthly_nights_align_with_months():
    site = cluster(detections())[0]
    assert run.monthly_nights(site, ["2026-10", "2026-11"]) == [0, 3]


def test_public_archive_never_keeps_nightfire_rows():
    from dataclasses import replace
    d = detections()
    vnf = [replace(x, source="nightfire", rh_mw=5.0) for x in d]
    assert run.public_only(d + vnf) == d


def test_rh75_sums_pixels_above_75_percent_of_peak():
    from datetime import datetime, timezone
    from flarewatch.sources.base import Detection
    t = datetime(2026, 11, 5, 20, 30, tzinfo=timezone.utc)
    px = [Detection(27.7, 68.8, t, "N20", "nightfire", rh_mw=v) for v in (10.0, 8.0, 7.0, 2.0)]
    later = [Detection(27.7, 68.8, t.replace(hour=22), "N20", "nightfire", rh_mw=4.0)]
    r = run.overpass_rh75(px + later)
    assert sorted(r.values()) == [4.0, 18.0]


def test_vnf_csv_parsing_filters_cloud_day_and_missing():
    from flarewatch.sources import nightfire
    df = pd.DataFrame({
        "Lat_GMTCO": [27.7, 27.7, 27.7, 27.7, 50.0],
        "Lon_GMTCO": [68.8, 68.8, 68.8, 68.8, 10.0],
        "Date_Mscan": ["2026/11/05 20:31:02.123"] * 5,
        "Temp_BB": [1800, 1700, 999999, 1800, 1800],
        "RH": [5.0, 4.0, 999999.0, 3.0, 9.0],
        "Cloud_Mask": [0, 1, 0, 3, 0],
        "SOLZ_GMTCO": [120, 120, 120, 120, 120],
    })
    d = nightfire.parse_frame(df, "N20")
    assert [x.rh_mw for x in d] == [5.0, 4.0]
    assert all(x.source == "nightfire" for x in d)
    assert nightfire.satellite_from_name("VNF_j01_d20261105_noaa_v30.csv.gz") == "N20"
