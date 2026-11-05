# FlareWatch

Independent satellite audit of gas flaring in Pakistan, built for the LUMS x OGDCL Cleantech Hackathon 2026 by team Hexabytes.

## How it works

1. A nightly GitHub Actions job (`.github/workflows/nightly.yml`) pulls last night's VIIRS hotspots from NASA FIRMS (NOAA-20 and NOAA-21).
2. The Python pipeline (`pipeline/`) keeps a rolling 180-day archive, clusters repeat hotspots into sites, removes known brick kilns, and labels sites persistent, intermittent or sporadic.
3. Volumes always carry a range and a method label:
   - **nightfire**: VIIRS Nightfire radiant heat x John Zink calibration (needs the EOG academic licence)
   - **baseline**: World Bank annual per-flare volume (2012-2025, CC BY 4.0)
   - **indicative**: baseline scaled by recent FIRMS brightness (our own, untested method)
4. Results are written to `web/public/data/`, and the Next.js app (`web/`) shows them on a map.

## Setup

- Add the repository secret `FIRMS_MAP_KEY` (Settings → Secrets and variables → Actions).
- Run the "Nightly flare update" workflow once by hand (Actions tab → Run workflow, days = 5) to seed data.

## Local development

```bash
cd pipeline && pip install -r requirements.txt && python -m pytest -q
cd web && npm install && npm run dev
```
