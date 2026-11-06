"""Flare report card, A (small, rare) to F (large, burns almost every month).

Keep in step with web/src/grade.ts: the web computes the same grade for
display; this copy is for emails and the weekly briefing.
"""

from __future__ import annotations

from typing import Optional

SIZE_STEPS = (0.02, 0.1, 0.3, 0.7)  # MMSCFD


def grade(site: dict) -> Optional[str]:
    vol = site.get("volume")
    if not vol:
        return None
    q = vol["mmscfd"]["mid"]
    size = sum(q >= x for x in SIZE_STEPS)
    share = site.get("active_share", 0)
    burn = 2 if share >= 0.8 else 1 if share >= 0.5 else 0
    direction = (site.get("trend") or {}).get("direction")
    trend = 1 if direction == "worsening" else -1 if direction == "improving" else 0
    points = max(0, size + burn + trend)
    return "A" if points <= 1 else "B" if points == 2 else "C" if points == 3 else "D" if points == 4 else "F"
