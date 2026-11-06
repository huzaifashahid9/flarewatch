"""Email through Resend, and the follower list in Upstash Redis.

Everything here is optional: without the keys the functions do nothing and
say so, so the nightly job never fails over email.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import List, Sequence
from urllib.parse import quote

import requests

SITE = os.environ.get("FLAREWATCH_SITE_URL", "https://flarewatch-chi.vercel.app")


def flare_url(site_id: str) -> str:
    return f"{SITE}/flares/{quote(site_id)}"


def send(to: Sequence[str], subject: str, html: str) -> bool:
    key = os.environ.get("RESEND_API_KEY")
    to = [t.strip() for t in to if t and t.strip()]
    if not key or not to:
        print(f"Email not sent (not configured): {subject}")
        return False
    r = requests.post("https://api.resend.com/emails", timeout=30,
                      headers={"Authorization": f"Bearer {key}"},
                      json={"from": os.environ.get("ALERT_FROM", "FlareWatch <onboarding@resend.dev>"),
                            "to": to, "subject": subject, "html": html})
    r.raise_for_status()
    return True


def team_emails() -> List[str]:
    return [t for t in os.environ.get("ALERT_EMAILS", "").split(",") if t.strip()]


def _redis(*cmd: str):
    url, token = os.environ.get("UPSTASH_REDIS_REST_URL"), os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        return None
    r = requests.post(url, json=list(cmd), timeout=30, headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json().get("result")


def followers(site_id: str) -> List[str]:
    """Confirmed followers of one flare (written by the web app's /api/follow)."""
    return sorted(_redis("SMEMBERS", f"follow:{site_id}") or [])


def unsubscribe_url(email: str, site_id: str) -> str:
    secret = os.environ.get("FOLLOW_SECRET", "")
    sig = hmac.new(secret.encode(), f"{email}|{site_id}".encode(), hashlib.sha256).hexdigest()
    return f"{SITE}/api/follow/unsubscribe?email={quote(email)}&site={quote(site_id)}&sig={sig}"
