#!/usr/bin/env python3
"""
================================================================================
LEGACY FILE - PERMANENTLY DISABLED
================================================================================

This file has been disabled as part of the v2.2 Full-Universe Refactor.

REASON: This script used the legacy run_daily_intelligence.py which has been
        disabled. It also used TOP50/TOP100 universe caps which are no longer
        supported.

USE INSTEAD:
    python -m quant_system.run_full_daily_intelligence --full-universe

The full pipeline handles all snapshot generation internally.
================================================================================
"""

raise RuntimeError(
    "╔══════════════════════════════════════════════════════════════════════════╗\n"
    "║              GENERATE_SNAPSHOTS.PY DISABLED                              ║\n"
    "╠══════════════════════════════════════════════════════════════════════════╣\n"
    "║ This script has been permanently disabled.                               ║\n"
    "║                                                                          ║\n"
    "║ It relied on the legacy run_daily_intelligence.py which is no longer     ║\n"
    "║ available. The system now uses full-universe execution only.             ║\n"
    "║                                                                          ║\n"
    "║ USE INSTEAD:                                                             ║\n"
    "║   python -m quant_system.run_full_daily_intelligence --full-universe     ║\n"
    "║                                                                          ║\n"
    "║ All snapshot generation is now handled by the main pipeline.             ║\n"
    "╚══════════════════════════════════════════════════════════════════════════╝"
)
