"""Email the team when a new flare appears.

A site is "new" when its first detection in the one-year archive is within
the last NEW_DAYS days. Sends through Resend only when RESEND_API_KEY and
ALERT_EMAILS (comma-separated) are set; otherwise it just prints. Ids that
were already announced are kept in data/archive/alerted.json.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests

SITES = Path("../web/public/data/sites.geojson")
ALERTED = Path("../data/archive/alerted.json")
SITE_URL = "https://flarewatch-chi.vercel.app/?site="


def main() -> int:
    meta = json.loads(Path("../web/public/data/meta.json").read_text())
    new_ids = meta.get("new_sites", [])
    done = set(json.loads(ALERTED.read_text())) if ALERTED.exists() else set()
    fresh = [i for i in new_ids if i not in done]
    if not fresh:
        print("No new flares to announce")
        return 0
    sites = {f["properties"]["id"]: f["properties"]
             for f in json.loads(SITES.read_text())["features"]}
    lines = []
    for i in fresh:
        s = sites.get(i, {})
        near = s.get("nearest_field")
        where = f" near {near['name']} ({near['km']} km)" if near else ""
        lines.append(f"<li><a href=\"{SITE_URL}{i}\">{i}</a>{where}: first seen {s.get('first_seen')}, "
                     f"{s.get('nights_detected')} nights so far</li>")
    html = (f"<p>FlareWatch spotted {len(fresh)} new heat source(s) in Pakistan:</p><ul>{''.join(lines)}</ul>"
            "<p>New sites start as unconfirmed. They may be new flares, or fires and industry.</p>")
    key, to = os.environ.get("RESEND_API_KEY"), os.environ.get("ALERT_EMAILS")
    if key and to:
        r = requests.post("https://api.resend.com/emails", timeout=30,
                          headers={"Authorization": f"Bearer {key}"},
                          json={"from": os.environ.get("ALERT_FROM", "FlareWatch <onboarding@resend.dev>"),
                                "to": [t.strip() for t in to.split(",") if t.strip()],
                                "subject": f"FlareWatch: {len(fresh)} new flare site(s) in Pakistan",
                                "html": html})
        r.raise_for_status()
        print(f"Emailed {len(fresh)} new sites")
    else:
        print("Email not configured; new sites:", ", ".join(fresh))
    ALERTED.parent.mkdir(parents=True, exist_ok=True)
    ALERTED.write_text(json.dumps(sorted(done | set(fresh))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
