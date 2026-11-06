"""Nightly emails.

1. New flares: a site first seen in the last two weeks (meta.new_sites) is
   announced once to the team (ALERT_EMAILS). Announced ids are kept in
   data/archive/alerted.json.
2. Followed flares: anyone who followed a flare on the website gets an email
   when its report card grade changes. Last grades are in data/archive/grades.json.
"""

from __future__ import annotations

import json
from html import escape
from pathlib import Path

from . import mailer

SITES = Path("../web/public/data/sites.geojson")
META = Path("../web/public/data/meta.json")
ALERTED = Path("../data/archive/alerted.json")
GRADES = Path("../data/archive/grades.json")


def load_sites() -> dict:
    return {f["properties"]["id"]: f["properties"] for f in json.loads(SITES.read_text())["features"]}


def label(s: dict) -> str:
    near = s.get("nearest_field")
    return escape(near["name"]) if near else escape(s.get("id", ""))


def new_flares(sites: dict) -> None:
    meta = json.loads(META.read_text())
    done = set(json.loads(ALERTED.read_text())) if ALERTED.exists() else set()
    fresh = [i for i in meta.get("new_sites", []) if i not in done]
    if not fresh:
        print("No new flares to announce")
        return
    lines = [f"<li><a href=\"{mailer.flare_url(i)}\">{label(sites.get(i, {'id': i}))}</a>: first seen "
             f"{sites.get(i, {}).get('first_seen')}, {sites.get(i, {}).get('nights_detected')} nights so far</li>"
             for i in fresh]
    html = (f"<p>FlareWatch spotted {len(fresh)} new heat source(s) in Pakistan:</p><ul>{''.join(lines)}</ul>"
            "<p>New sites start as unconfirmed. They may be new flares, or fires and industry.</p>")
    mailer.send(mailer.team_emails(), f"FlareWatch: {len(fresh)} new flare site(s) in Pakistan", html)
    ALERTED.parent.mkdir(parents=True, exist_ok=True)
    ALERTED.write_text(json.dumps(sorted(done | set(fresh))))


def grade_changes(sites: dict, before: dict) -> list:
    return [(i, before[i], s.get("grade")) for i, s in sites.items()
            if i in before and s.get("grade") and before[i] and s.get("grade") != before[i]]


def followed_changes(sites: dict) -> None:
    before = json.loads(GRADES.read_text()) if GRADES.exists() else {}
    for site_id, old, new in grade_changes(sites, before):
        for email in mailer.followers(site_id):
            s = sites[site_id]
            html = (f"<p>The FlareWatch report card for <a href=\"{mailer.flare_url(site_id)}\">{label(s)}</a> "
                    f"changed from <b>{old}</b> to <b>{new}</b>.</p>"
                    f"<p>A is a small, rare flare; F is a large flare that burns almost every month.</p>"
                    f"<p style=\"color:#777\"><a href=\"{mailer.unsubscribe_url(email, site_id)}\">Stop following this flare</a></p>")
            mailer.send([email], f"FlareWatch: {label(s)} is now grade {new}", html)
    GRADES.parent.mkdir(parents=True, exist_ok=True)
    GRADES.write_text(json.dumps({i: s.get("grade") for i, s in sorted(sites.items())}))


def main() -> int:
    sites = load_sites()
    new_flares(sites)
    try:
        followed_changes(sites)
    except Exception as exc:  # follower mail must not block the new-flare mail or the commit
        print(f"Follower alerts failed: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
