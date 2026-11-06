"""Weekly briefing: a short plain-language summary of what changed, in English and Urdu.

Runs after the nightly pipeline. Once a week (or with --force) it compares the
current sites with the snapshot taken at the last briefing, asks Claude to
write the summary from those facts only, saves it to web/public/data/briefing.json
for the Overview page, and emails it to the team (ALERT_EMAILS).

Needs ANTHROPIC_API_KEY. Without it, the step does nothing.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import Optional

from . import mailer

SITES = Path("../web/public/data/sites.geojson")
META = Path("../web/public/data/meta.json")
OUT = Path("../web/public/data/briefing.json")
STATE = Path("../data/archive/briefing_state.json")
MODEL = "claude-opus-5-5"
PKR_PER_USD = 280

SCHEMA = {
    "type": "object",
    "properties": {
        "headline_en": {"type": "string"},
        "summary_en": {"type": "string"},
        "headline_ur": {"type": "string"},
        "summary_ur": {"type": "string"},
    },
    "required": ["headline_en", "summary_en", "headline_ur", "summary_ur"],
    "additionalProperties": False,
}

SYSTEM = (
    "You write the weekly FlareWatch briefing about gas flaring in Pakistan for officials, "
    "journalists and the public. Use only the facts given; never invent numbers, places or causes. "
    "Write a headline of at most 12 words and a summary of 3 to 5 short sentences in plain words "
    "(no jargon such as MMSCFD or FRP). Money is in Pakistani rupees crore. Say plainly when "
    "nothing much changed. Give the same briefing in natural Urdu (Urdu script), keeping place "
    "and company names as they are."
)


def crore(usd: float) -> int:
    return round(usd * PKR_PER_USD / 1e7)


def _name(s: dict) -> str:
    near = s.get("nearest_field") or {}
    return near.get("name") or f"unnamed site at {s['lat']:.2f}, {s['lon']:.2f}"


def facts(sites: dict, meta: dict, before: dict) -> dict:
    """What the briefing is allowed to say: this week's numbers against the last briefing."""
    old_sites = before.get("sites", {})
    loss = lambda s: (s.get("impact") or {}).get("value_usd_per_yr", {}).get("mid", 0)
    new = [i for i in sites if i not in old_sites]
    changes = [{"flare": _name(sites[i]), "from": old_sites[i], "to": sites[i].get("grade")}
               for i in sites if i in old_sites and old_sites[i] and sites[i].get("grade")
               and old_sites[i] != sites[i].get("grade")]
    top = sorted(sites.values(), key=loss, reverse=True)[:5]
    months = meta.get("observed_months") or []
    month_nights = [sum((s.get("monthly_nights") or [0] * len(months))[k] for s in sites.values())
                    for k in range(len(months))]
    total = (meta.get("totals") or {}).get("value_usd_per_yr", {}).get("mid")
    return {
        "since": before.get("at"),
        "flare_sites_tracked": len(sites),
        "loss_per_year_rs_crore": crore(total) if total else None,
        "loss_last_briefing_rs_crore": before.get("loss_crore"),
        "new_sites_since_last_briefing": [{"place": _name(sites[i]), "province": sites[i].get("province"),
                                           "known_flare": sites[i].get("in_world_bank_catalogue")} for i in new][:10],
        "grade_changes": changes[:10],
        "biggest_flares": [{"place": _name(s), "operator": (s.get("nearest_field") or {}).get("operator"),
                            "grade": s.get("grade"), "loss_rs_crore": crore(loss(s))} for s in top],
        "flare_nights_by_month": dict(zip(months[-4:], month_nights[-4:])),
        "provinces_rs_crore": {p["name"]: crore(p["value_usd_per_yr"]) for p in meta.get("provinces", [])
                               if p.get("value_usd_per_yr")},
    }


def write(f: dict) -> Optional[dict]:
    import anthropic  # only needed when the key is set

    client = anthropic.Anthropic()
    msg = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": "This week's facts as JSON:\n" + json.dumps(f, ensure_ascii=False)}],
    )
    if msg.stop_reason == "refusal":
        print("Briefing declined by the model")
        return None
    text = next((b.text for b in msg.content if b.type == "text"), "")
    return json.loads(text)


def snapshot(sites: dict, meta: dict, now: datetime) -> dict:
    total = (meta.get("totals") or {}).get("value_usd_per_yr", {}).get("mid")
    return {"at": now.isoformat(), "loss_crore": crore(total) if total else None,
            "sites": {i: s.get("grade") for i, s in sites.items()}}


def due(before: dict, now: datetime) -> bool:
    at = before.get("at")
    return not at or now - datetime.fromisoformat(at) >= timedelta(days=6)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="write a briefing even if one was sent this week")
    args = ap.parse_args(argv)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Briefing skipped: ANTHROPIC_API_KEY not set")
        return 0
    now = datetime.now(timezone.utc)
    before = json.loads(STATE.read_text()) if STATE.exists() else {}
    if not args.force and not due(before, now):
        print("Briefing skipped: last one is less than a week old")
        return 0
    sites = {f["properties"]["id"]: f["properties"] for f in json.loads(SITES.read_text())["features"]}
    meta = json.loads(META.read_text())
    f = facts(sites, meta, before)
    b = write(f)
    if not b:
        return 0
    OUT.write_text(json.dumps({**b, "generated_at": now.isoformat(), "since": f["since"], "model": MODEL},
                              ensure_ascii=False, indent=1))
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(snapshot(sites, meta, now)))
    html = (f"<h2>{escape(b['headline_en'])}</h2><p>{escape(b['summary_en'])}</p>"
            f"<div dir=\"rtl\" lang=\"ur\"><h2>{escape(b['headline_ur'])}</h2><p>{escape(b['summary_ur'])}</p></div>"
            f"<p><a href=\"{mailer.SITE}\">Open FlareWatch</a>. Written by AI from the week's satellite numbers.</p>")
    try:
        mailer.send(mailer.team_emails(), f"FlareWatch weekly: {b['headline_en']}", html)
    except Exception as exc:
        print(f"Briefing email failed: {exc}")
    print("Briefing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
