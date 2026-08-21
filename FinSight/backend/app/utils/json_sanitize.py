"""
NaN/-inf sanitizer for API responses - shared utility.

Recurring bug pattern this session: Python's json.load() happily
accepts a literal `NaN`/`Infinity`/`-Infinity` bareword (not valid
JSON, but Python's json module is lenient about it), so a pipeline
that ever wrote one of those into a snapshot file loads back in as a
real Python float('nan') - which then crashes on the way OUT, because
FastAPI's own JSONResponse encoder rejects them outright ("Out of
range float values are not JSON compliant"). First hit in
announcements_api.py (pandas-sourced NaN); recurs anywhere a snapshot
file or a pandas DataFrame feeds a response directly - e.g. the
NIFTYBEES.NS "no data found" 500 traced to this in /api/stock-snapshot.
"""
import math
from typing import Any

from fastapi.responses import JSONResponse


def sanitize_nan(obj: Any) -> Any:
    """Recursively replace NaN/inf with None."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_nan(v) for v in obj]
    return obj


class SanitizingJSONResponse(JSONResponse):
    """Drop-in JSONResponse that never 500s on a NaN/Infinity slipping
    into a response body. Set as the app's default_response_class
    (main.py) so this is handled once, globally, rather than requiring
    every endpoint that reads a snapshot file or a pandas DataFrame to
    remember to sanitize its own output - this exact bug recurred 3
    times this session (announcements_api.py, /api/stock-snapshot for
    NIFTYBEES.NS) before being made a global default instead of a
    per-endpoint patch."""

    def render(self, content: Any) -> bytes:
        return super().render(sanitize_nan(content))
