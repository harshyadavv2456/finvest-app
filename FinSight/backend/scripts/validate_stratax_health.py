#!/usr/bin/env python3
"""
================================================================================
STRATAX HEALTH VALIDATION SCRIPT
================================================================================

Validates StrataX health reports and determines pipeline behavior.

EXECUTION RULES:
- Reads health reports from artifacts/health/
- CORE data sources: FORMAT_CHANGED/PERMANENT_FAILURE → EXIT 1
- AUXILIARY data sources: FORMAT_CHANGED/PERMANENT_FAILURE → LOG WARNING, WRITE FLAG, EXIT 0

StrataX is AUXILIARY - it should NEVER fail the main stock intelligence pipeline.
Degradation is logged and flagged but pipeline continues.

================================================================================
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from app.stratax.data_source_health import (
        DataSourceState,
        DataSourceHealth,
        DataCriticality,
        HealthReportWriter,
    )
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)


def write_degradation_flag(health_dir: Path, degraded_reports: List[DataSourceHealth]):
    """
    Write a degradation flag file for audit purposes.
    
    This file indicates that AUXILIARY data sources are degraded.
    The pipeline continues but this is visible in logs and artifacts.
    """
    flag_path = health_dir / "STRATAX_DEGRADED.flag"
    
    with open(flag_path, 'w') as f:
        f.write(f"STRATAX DATA DEGRADATION NOTICE\n")
        f.write(f"{'=' * 50}\n")
        f.write(f"Generated at: {datetime.now().isoformat()}\n\n")
        f.write(f"The following AUXILIARY data sources are degraded:\n\n")
        
        for h in degraded_reports:
            f.write(f"  Source: {h.source}\n")
            f.write(f"  Symbol: {h.symbol}\n")
            f.write(f"  State: {h.state.value}\n")
            f.write(f"  Criticality: {h.criticality.value}\n")
            f.write(f"  Message: {h.message}\n")
            f.write(f"  Last Success: {h.last_success or 'never'}\n")
            f.write(f"\n")
        
        f.write(f"{'=' * 50}\n")
        f.write(f"NOTE: Pipeline continues because these are AUXILIARY sources.\n")
        f.write(f"Stock intelligence will be generated without StrataX data.\n")
    
    print(f"   Degradation flag written to: {flag_path}")


def main():
    """Validate StrataX health and determine pipeline behavior."""
    print("=" * 60)
    print("STRATAX HEALTH VALIDATION")
    print("=" * 60)
    print()
    
    # Find health reports
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    health_dir = project_root / "artifacts" / "health"
    
    print(f"Health directory: {health_dir}")
    print()
    
    if not health_dir.exists():
        print("⚠️  No health reports found - directory doesn't exist")
        print("   Assuming first run, continuing...")
        sys.exit(0)
    
    # Read all health reports
    health_writer = HealthReportWriter(health_dir)
    reports = health_writer.read_all_health()
    
    if not reports:
        print("⚠️  No health reports found in directory")
        print("   Assuming first run, continuing...")
        sys.exit(0)
    
    # Filter to NSE/StrataX reports only
    stratax_reports = {k: v for k, v in reports.items() if v.source == "NSE"}
    
    if not stratax_reports:
        print("⚠️  No NSE/StrataX health reports found")
        print("   Assuming first run, continuing...")
        sys.exit(0)
    
    # Analyze health states
    healthy = []
    blocked = []
    degraded_auxiliary = []  # FORMAT_CHANGED or PERMANENT for AUXILIARY
    failed_core = []         # FORMAT_CHANGED or PERMANENT for CORE
    
    for key, health in stratax_reports.items():
        if health.state == DataSourceState.HEALTHY:
            healthy.append(health)
        elif health.state == DataSourceState.TEMPORARILY_BLOCKED:
            blocked.append(health)
        elif health.state in [DataSourceState.FORMAT_CHANGED, DataSourceState.PERMANENT_FAILURE]:
            # Check criticality
            if health.criticality == DataCriticality.CORE:
                failed_core.append(health)
            else:
                degraded_auxiliary.append(health)
    
    # Print summary
    print("Health Report Summary:")
    print("-" * 40)
    
    if healthy:
        print(f"✅ HEALTHY: {len(healthy)}")
        for h in healthy:
            print(f"   • {h.symbol}")
    
    if blocked:
        print(f"⚠️  TEMPORARILY BLOCKED: {len(blocked)}")
        for h in blocked:
            print(f"   • {h.symbol}: {h.message[:50]}...")
            if h.last_success:
                print(f"     Last success: {h.last_success}")
    
    if degraded_auxiliary:
        print(f"🔶 DEGRADED (AUXILIARY): {len(degraded_auxiliary)}")
        for h in degraded_auxiliary:
            print(f"   • {h.symbol}: {h.state.value}")
            print(f"     {h.message[:50]}...")
    
    if failed_core:
        print(f"❌ FAILED (CORE): {len(failed_core)}")
        for h in failed_core:
            print(f"   • {h.symbol}: {h.state.value}")
            print(f"     {h.message[:50]}...")
    
    print()
    print("-" * 40)
    
    # Determine exit code based on criticality
    
    # CORE failures → FAIL PIPELINE
    if failed_core:
        print()
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║  CORE DATA SOURCE FAILURE - PIPELINE MUST FAIL               ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        for h in failed_core:
            print(f"║  • {h.symbol}: {h.state.value:<40}║")
        print("║                                                              ║")
        print("║  CORE data sources are required for pipeline execution.      ║")
        print("║  Fix the issue and retry.                                    ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        sys.exit(1)
    
    # AUXILIARY degradation → LOG WARNING, WRITE FLAG, CONTINUE
    if degraded_auxiliary:
        print()
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║  STRATAX DEGRADED (AUXILIARY DATA SOURCE)                    ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        for h in degraded_auxiliary:
            print(f"║  • {h.symbol}: {h.state.value:<40}║")
        print("║                                                              ║")
        print("║  StrataX is AUXILIARY - pipeline continues WITHOUT it.       ║")
        print("║  Stock intelligence will be generated normally.              ║")
        print("║                                                              ║")
        print("║  This is expected behavior when NSE is blocking requests.    ║")
        print("║  StrataX data is supplementary options analysis.             ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        
        # Write degradation flag for audit
        write_degradation_flag(health_dir, degraded_auxiliary)
        
        print()
        print("✅ Pipeline continues (AUXILIARY degradation logged)")
        sys.exit(0)
    
    # TEMPORARILY_BLOCKED → CONTINUE
    if blocked:
        print()
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║  STRATAX: TEMPORARILY BLOCKED (NSE rate-limiting)            ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        print("║  This is NOT a pipeline failure.                             ║")
        print("║  NSE blocks are expected and temporary.                      ║")
        for h in blocked:
            if h.last_success:
                print(f"║  {h.symbol}: Last success was {h.last_success:<20}║")
            else:
                print(f"║  {h.symbol}: No previous success recorded              ║")
        print("║                                                              ║")
        print("║  StrataX data is OPTIONAL for FinSight intelligence.         ║")
        print("║  Core pipeline will continue.                                ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        sys.exit(0)
    
    # ALL HEALTHY → CONTINUE
    if healthy:
        print()
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║  STRATAX VALIDATION PASSED                                   ║")
        print("╠══════════════════════════════════════════════════════════════╣")
        print(f"║  All {len(healthy)} symbols fetched successfully                 ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        sys.exit(0)
    
    # Shouldn't reach here
    print("⚠️  Unknown state - continuing with caution")
    sys.exit(0)


if __name__ == "__main__":
    main()
