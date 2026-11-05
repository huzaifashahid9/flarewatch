"""VIIRS Nightfire plug (Payne Institute EOG). Needs the academic licence.

Until the licence arrives this plug reports itself as not configured, and the
pipeline falls back to FIRMS plus the World Bank baseline. When access is
granted, implement `fetch` to return Detection objects with `rh75_mw` and
`temperature_k` filled in, then set FLAREWATCH_USE_NIGHTFIRE=1.
"""

from __future__ import annotations

import os
from typing import List

from .base import Detection, SourceNotConfigured


def enabled() -> bool:
    return os.environ.get("FLAREWATCH_USE_NIGHTFIRE") == "1"


def fetch(*_args, **_kwargs) -> List[Detection]:
    raise SourceNotConfigured(
        "VIIRS Nightfire licence not configured yet; using FIRMS + World Bank baseline"
    )
