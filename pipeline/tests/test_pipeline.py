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


def test_national_trend_and_timeline(tmp_path):
    from flarewatch.sources.base import BaselineFlare
    t = run.national_trend([BaselineFlare(1, 1, 2024, 0.1), BaselineFlare(2, 2, 2024, 0.05),
                            BaselineFlare(1, 1, 2025, 0.12)])
    assert t == [{"year": 2024, "bcm": 0.15}, {"year": 2025, "bcm": 0.12}]
    import json
    from dataclasses import replace
    d = detections()
    run.write_timeline(d + [replace(d[0], source="nightfire", rh_mw=3.0)], tmp_path)
    tl = json.loads((tmp_path / "timeline.json").read_text())
    assert tl["rows"][0][0] == 0 and len(tl["rows"]) <= len(d)


def test_pakistan_equivalents():
    imp = run.impact(estimate.Range(1, 1, 1))
    # 1 BCM = 35.3 million MMBtu, about 10.4 cargoes; 456.6 MW, about 1.67 million homes
    assert imp["lng_cargoes_per_yr"]["mid"] == pytest.approx(10.39, abs=0.01)
    assert imp["homes_powered"]["mid"] == pytest.approx(4e9 / 2400, rel=1e-3)


def test_osm_parse_and_nearest_field():
    from flarewatch.sources import osm
    payload = {"elements": [
        {"type": "node", "lat": 27.70, "lon": 68.81, "tags": {"name": "Example Gas Field", "operator": "X"}},
        {"type": "way", "center": {"lat": 30.0, "lon": 70.0}, "tags": {"industrial": "gas"}},
        {"type": "node", "lat": 27.70, "lon": 68.81, "tags": {"name": "Example Gas Field"}},
    ]}
    f = osm.parse(payload)
    assert len(f) == 1 and f[0]["operator"] == "X"
    near = run.nearest_field(27.7005, 68.8003, f)
    assert near["name"] == "Example Gas Field" and near["km"] < 2
    assert run.nearest_field(35.0, 75.0, f) is None


def test_new_sites_use_first_seen():
    from datetime import date
    sites = [{"id": "a", "first_seen": "2026-11-01", "activity_class": "new"},
             {"id": "b", "first_seen": "2026-01-01", "activity_class": "persistent"}]
    assert run.new_sites(sites, today=date(2026, 11, 6)) == ["a"]


def test_recent_multi_night_site_is_new():
    from datetime import datetime, timezone
    from flarewatch.sources.base import Detection
    filler = [Detection(30.0 + m / 10, 70.0, datetime(2026, m, 1, 21, tzinfo=timezone.utc),
                        "N20", "firms") for m in range(1, 12)]
    burning = [Detection(27.7, 68.8, datetime(2026, 11, day, 21, tzinfo=timezone.utc), "N20", "firms")
               for day in range(1, 7)]
    sites = run.build_sites(burning + filler, [])
    assert [s["activity_class"] for s in sites] == ["new"]
    assert run.new_sites(sites, today=datetime(2026, 11, 7).date()) == [sites[0]["id"]]


def test_province_lookup():
    from flarewatch import geo
    assert geo.province(25.39, 68.37) == "Sindh"          # Hyderabad
    assert geo.province(33.30, 71.18) == "Khyber Pakhtunkhwa"  # Karak
    assert geo.province(29.55, 67.88) == "Balochistan"     # Sui area
    assert geo.province(31.52, 74.35) == "Punjab"          # Lahore


def test_baseline_trend():
    from flarewatch import run
    hist = [[2019, 0.010], [2020, 0.012], [2021, 0.010], [2022, 0.008], [2023, 0.007], [2024, 0.006]]
    t = run.trend(hist)
    assert t["direction"] == "improving" and t["from_year"] == 2021 and t["to_year"] == 2024
    assert t["change_pct"] == -40
    assert run.trend([[2023, 0.01], [2024, 0.0105]])["direction"] == "steady"
    assert run.trend([[2023, 0.01], [2024, 0.02]])["direction"] == "worsening"
    assert run.trend([[2024, 0.01]]) is None


def test_baseline_history_and_provinces():
    from flarewatch import run
    from flarewatch.sources.base import BaselineFlare
    base = [BaselineFlare(lat=25.0, lon=68.0, year=y, bcm=0.01 * i, flare_id="F1")
            for i, y in enumerate([2022, 2023, 2024], start=1)]
    base.append(BaselineFlare(lat=26.0, lon=69.0, year=2024, bcm=0.5, flare_id="F2"))
    assert run.baseline_history(base[2], base) == [[2022, 0.01], [2023, 0.02], [2024, 0.03]]
    sites = [
        {"province": "Sindh", "in_world_bank_catalogue": True,
         "volume": {"mmscfd": {"mid": 1.0}}, "impact": {"value_usd_per_yr": {"mid": 100.0}}},
        {"province": "Punjab", "in_world_bank_catalogue": False, "volume": None},
        {"province": "Sindh", "in_world_bank_catalogue": False, "volume": None},
    ]
    rows = run.province_totals(sites)
    assert rows[0]["name"] == "Sindh" and rows[0]["sites"] == 2 and rows[0]["value_usd_per_yr"] == 100


def test_osm_name_filter_drops_non_flare_sites():
    from flarewatch.sources import osm
    assert osm.is_flare_candidate("Qadirpur Gas Plant")
    assert osm.is_flare_candidate("Attock Refinery")
    for bad in ("Bajwa Cotton Ginning & Oil Mills", "PSO Oil Depot", "Irfan Oil Depo", "Zam Zam Petrol Pump",
                "Gold Star Lubricants", "Attock Refinery Road"):
        assert not osm.is_flare_candidate(bad), bad


def test_field_operator_lookup():
    from pathlib import Path
    from flarewatch import run
    ops = run.load_operators(Path(__file__).parents[2] / "data" / "reference" / "field_operators.csv")
    assert run.operator_for("Kunnar LPG Plant & Oil Field", ops) == "OGDCL"
    assert run.operator_for("Makori East 02", ops) == "MOL Pakistan"
    assert run.operator_for("Some Unknown Field", ops) is None
    fields = [{"name": "Qadirpur Gas Plant", "lat": 28.0, "lon": 69.0, "operator": None}]
    nf = run.nearest_field(28.01, 69.0, fields, ops)
    assert nf["operator"] == "OGDCL" and nf["km"] == 1.1


def test_parse_day_only_keeps_day_passes():
    day = firms.parse_csv(FIXTURE.read_text(), "VIIRS_NOAA20_NRT", day_only=True)
    raw = pd.read_csv(FIXTURE)
    assert len(day) == int((raw["daynight"].str.strip() == "D").sum())


def test_fire_pattern():
    assert run.fire_pattern(nights=3, days=20) == "mostly daytime"
    assert run.fire_pattern(nights=200, days=60) == "day and night"
    assert run.fire_pattern(nights=5, days=4) == "too little data"


def test_population_within_radius():
    import numpy as np
    from flarewatch.population import PopulationGrid
    # 0.01 degree cells (about 1.1 km), 100 people per cell, centred on 30N 70E.
    grid = PopulationGrid(np.full((200, 200), 100.0), west=69.0, north=31.0, cell_deg=0.01)
    n = grid.people_within(30.0, 70.0, 5.0)
    # A 5 km circle is about 78.5 km2; cells are about 1.11 x 0.96 km.
    assert 6000 < n < 8500
    assert grid.people_within(10.0, 10.0, 5.0) == 0


def test_grade_matches_web_rules():
    from flarewatch.grade import grade
    site = {"volume": {"mmscfd": {"mid": 0.5}}, "active_share": 0.9}
    assert grade(site) == "F"
    assert grade({**site, "trend": {"direction": "improving"}}) == "D"
    assert grade({"volume": {"mmscfd": {"mid": 0.01}}, "active_share": 0.2}) == "A"
    assert grade({"volume": None}) is None


def test_briefing_facts_and_schedule():
    from datetime import datetime, timedelta, timezone

    from flarewatch import briefing

    site = lambda i, g, usd: {"id": i, "lat": 27.0, "lon": 69.0, "grade": g, "province": "Sindh",
                              "nearest_field": {"name": f"Field {i}"}, "monthly_nights": [3, 4],
                              "impact": {"value_usd_per_yr": {"mid": usd}}}
    sites = {"a": site("a", "D", 2e6), "b": site("b", "B", 1e6)}
    meta = {"observed_months": ["2026-09", "2026-10"], "totals": {"value_usd_per_yr": {"mid": 3e6}},
            "provinces": [{"name": "Sindh", "value_usd_per_yr": 3e6}]}
    f = briefing.facts(sites, meta, {"at": "2026-10-30T00:00:00+00:00", "sites": {"a": "C"}})
    assert [n["place"] for n in f["new_sites_since_last_briefing"]] == ["Field b"]
    assert f["grade_changes"] == [{"flare": "Field a", "from": "C", "to": "D"}]
    assert f["biggest_flares"][0]["loss_rs_crore"] == 56
    assert f["flare_nights_by_month"] == {"2026-09": 6, "2026-10": 8}
    assert f["provinces_rs_crore"] == {"Sindh": 84}
    now = datetime(2026, 11, 6, tzinfo=timezone.utc)
    assert briefing.due({}, now)
    assert not briefing.due({"at": (now - timedelta(days=2)).isoformat()}, now)
    assert briefing.due({"at": (now - timedelta(days=7)).isoformat()}, now)
