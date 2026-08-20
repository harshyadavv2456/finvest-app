#!/usr/bin/env python3
"""
================================================================================
STRATAX DATA FETCHING SCRIPT - HARDENED VERSION
================================================================================

Fetches real-time option chain data from NSE and saves to JSON files.

EXECUTION RULES (NON-NEGOTIABLE):
- Uses hardened NSE fetcher with retry logic
- Produces explicit health reports for each symbol
- NO silent failures - every failure is logged and classified
- Health state determines pipeline behavior

HEALTH STATES:
- HEALTHY: Data fetched successfully
- TEMPORARILY_BLOCKED: NSE rate-limiting (log warning, continue)
- FORMAT_CHANGED: Response structure changed (FAIL PIPELINE)
- PERMANENT_FAILURE: Endpoint broken (FAIL PIPELINE)

Usage:
    python scripts/fetch_stratax_data.py NIFTY --quiet
    python scripts/fetch_stratax_data.py --all --quiet

================================================================================
"""

import sys
import json
import os
import argparse
import time as time_module
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Tuple

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from app.stratax.nse_fetcher import (
        fetch_nse_option_chain,
        parse_nse_option_chain,
        NSEDataError,
        NSEBlockedError,
        NSEFormatError,
        NSEPermanentError,
        NSETemporaryError,
    )
    from app.stratax.data_source_health import (
        DataSourceState,
        DataSourceHealth,
        DataCriticality,
        HealthReportWriter,
        create_healthy_report,
        create_blocked_report,
        create_format_changed_report,
        create_failure_report,
    )
    
    # StrataX is AUXILIARY - failures should NOT stop the main pipeline
    STRATAX_CRITICALITY = DataCriticality.AUXILIARY
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you're running from the backend directory or project root")
    sys.exit(1)


# All supported indices
ALL_INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]


def save_option_chain_data(
    underlying: str,
    expiry: Optional[str],
    output_dir: Path,
    health_writer: HealthReportWriter,
    quiet: bool = False
) -> Tuple[bool, DataSourceHealth]:
    """
    Fetch and save option chain data with health reporting.
    
    Args:
        underlying: Index name (NIFTY, BANKNIFTY, etc.)
        expiry: Optional expiry date (YYYY-MM-DD format)
        output_dir: Directory to save the JSON file
        health_writer: HealthReportWriter instance
        quiet: If True, minimize output
    
    Returns:
        Tuple of (success, health_report)
    """
    # Get last success date from previous health report
    last_success = health_writer.get_last_success_date("NSE", underlying)
    
    try:
        if not quiet:
            print(f"Fetching option chain for {underlying}...")
            if expiry:
                print(f"Expiry: {expiry}")
        
        # Fetch from NSE (uses hardened fetcher with retries)
        nse_data = fetch_nse_option_chain(underlying, expiry)
        parsed_data = parse_nse_option_chain(nse_data, underlying, expiry)
        
        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        expiry_str = expiry or parsed_data.get('expiry', 'current')
        filename = f"{underlying}_{expiry_str.replace('-', '_')}.json"
        output_path = output_dir / filename
        
        # Also save a "latest" copy
        latest_path = output_dir / f"{underlying}_latest.json"
        
        # Add metadata
        parsed_data['_fetched_at'] = datetime.utcnow().isoformat() + "Z"
        parsed_data['_source'] = 'nse_api'
        parsed_data['_health_state'] = 'healthy'
        
        # Save data
        with open(output_path, 'w') as f:
            json.dump(parsed_data, f, indent=2)
        
        with open(latest_path, 'w') as f:
            json.dump(parsed_data, f, indent=2)
        
        # Create healthy report (AUXILIARY - StrataX doesn't fail main pipeline)
        health = create_healthy_report(
            source="NSE",
            symbol=underlying,
            message=f"Successfully fetched {len(parsed_data.get('rows', []))} strikes @ {parsed_data.get('spot_price', 'N/A')}",
            criticality=STRATAX_CRITICALITY,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"✅ {underlying}: {len(parsed_data.get('rows', []))} strikes @ {parsed_data.get('spot_price', 'N/A')}")
        else:
            print(f"✅ Successfully saved data to: {output_path}")
            print(f"   Underlying: {parsed_data['underlying']}")
            print(f"   Expiry: {parsed_data['expiry']}")
            print(f"   Spot Price: {parsed_data['spot_price']}")
            print(f"   Rows: {len(parsed_data.get('rows', []))}")
            print(f"   Timestamp: {parsed_data['timestamp']}")
        
        return True, health
        
    except NSEBlockedError as e:
        # Temporarily blocked - log warning but don't fail pipeline
        health = create_blocked_report(
            source="NSE",
            symbol=underlying,
            message=str(e),
            criticality=STRATAX_CRITICALITY,
            retry_count=3,
            last_success=last_success,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"⚠️  {underlying}: TEMPORARILY BLOCKED - {e}")
        else:
            print(f"⚠️  NSE TEMPORARILY BLOCKED for {underlying}")
            print(f"   Reason: {e}")
            print(f"   Last success: {last_success or 'never'}")
            print(f"   Health state: {health.state.value}")
        
        return False, health
        
    except NSEFormatError as e:
        # Format changed - but StrataX is AUXILIARY, so pipeline continues
        health = create_format_changed_report(
            source="NSE",
            symbol=underlying,
            message=str(e),
            criticality=STRATAX_CRITICALITY,
            last_success=last_success,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"❌ {underlying}: FORMAT CHANGED - {e}")
        else:
            print(f"❌ NSE FORMAT CHANGED for {underlying}")
            print(f"   Reason: {e}")
            print(f"   This requires code update!")
            print(f"   Health state: {health.state.value}")
        
        return False, health
        
    except NSEPermanentError as e:
        # Permanent failure - but StrataX is AUXILIARY, so pipeline continues
        health = create_failure_report(
            source="NSE",
            symbol=underlying,
            message=str(e),
            criticality=STRATAX_CRITICALITY,
            error_type="NSEPermanentError",
            last_success=last_success,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"❌ {underlying}: PERMANENT FAILURE - {e}")
        else:
            print(f"❌ NSE PERMANENT FAILURE for {underlying}")
            print(f"   Reason: {e}")
            print(f"   Health state: {health.state.value}")
        
        return False, health
        
    except NSETemporaryError as e:
        # Temporary error after retries - treat as blocked
        health = create_blocked_report(
            source="NSE",
            symbol=underlying,
            message=str(e),
            criticality=STRATAX_CRITICALITY,
            retry_count=3,
            last_success=last_success,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"⚠️  {underlying}: TEMPORARILY UNAVAILABLE - {e}")
        else:
            print(f"⚠️  NSE TEMPORARILY UNAVAILABLE for {underlying}")
            print(f"   Reason: {e}")
            print(f"   Last success: {last_success or 'never'}")
        
        return False, health
        
    except Exception as e:
        # Unexpected error - treat as temporary
        health = create_blocked_report(
            source="NSE",
            symbol=underlying,
            message=f"Unexpected error: {e}",
            criticality=STRATAX_CRITICALITY,
            last_success=last_success,
        )
        health_writer.write_health(health)
        
        if quiet:
            print(f"⚠️  {underlying}: ERROR - {e}")
        else:
            print(f"⚠️  Unexpected error for {underlying}: {e}")
            import traceback
            traceback.print_exc()
        
        return False, health


def fetch_all_indices(
    output_dir: Path,
    health_writer: HealthReportWriter,
    quiet: bool = False,
    delay: float = 5.0
) -> Tuple[int, int, List[DataSourceHealth]]:
    """
    Fetch option chain data for all supported indices.
    
    Args:
        output_dir: Directory to save files
        health_writer: HealthReportWriter instance
        quiet: Minimize output
        delay: Delay between requests (seconds)
    
    Returns:
        Tuple of (success_count, total_count, health_reports)
    """
    success = 0
    total = len(ALL_INDICES)
    health_reports = []
    
    if not quiet:
        print(f"Fetching all {total} indices: {', '.join(ALL_INDICES)}")
        print()
    
    for i, underlying in enumerate(ALL_INDICES):
        result, health = save_option_chain_data(
            underlying, None, output_dir, health_writer, quiet
        )
        health_reports.append(health)
        
        if result:
            success += 1
        
        # Rate limit delay (except for last one)
        if i < total - 1 and delay > 0:
            if not quiet:
                print(f"   Waiting {delay}s before next request...")
            time_module.sleep(delay)
    
    return success, total, health_reports


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Fetch NSE option chain data for StrataX (hardened)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python fetch_stratax_data.py NIFTY             # Fetch NIFTY
  python fetch_stratax_data.py --all             # Fetch all indices
  python fetch_stratax_data.py --all --quiet     # Automation mode
        """
    )
    
    parser.add_argument(
        "underlying",
        nargs="?",
        default="NIFTY",
        help="Index to fetch (default: NIFTY)"
    )
    parser.add_argument(
        "expiry",
        nargs="?",
        default=None,
        help="Expiry date in YYYY-MM-DD format (optional)"
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Fetch all supported indices"
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Minimal output (for automation)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=5.0,
        help="Delay between requests in seconds (default: 5.0)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help="Output directory (default: data/stratax_cache)"
    )
    
    args = parser.parse_args()
    
    # Determine directories
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = project_root / "data" / "stratax_cache"
    
    # Create health writer
    health_writer = HealthReportWriter(project_root.parent / "artifacts" / "health")
    
    if not args.quiet:
        print("=" * 60)
        print("StrataX Data Fetcher (HARDENED)")
        print("=" * 60)
        print(f"Mode: {'All indices' if args.all else args.underlying.upper()}")
        print(f"Output Directory: {output_dir}")
        print(f"Health Reports: {health_writer.artifacts_dir}")
        print("=" * 60)
        print()
    
    if args.all:
        # Fetch all indices
        success, total, health_reports = fetch_all_indices(
            output_dir, health_writer, args.quiet, args.delay
        )
        
        if not args.quiet:
            print()
            print("=" * 60)
            print(f"Summary: {success}/{total} indices fetched successfully")
            print()
            print("Health States:")
            for h in health_reports:
                state_icon = "✅" if h.state == DataSourceState.HEALTHY else "⚠️" if h.state == DataSourceState.TEMPORARILY_BLOCKED else "❌"
                print(f"  {state_icon} {h.symbol}: {h.state.value}")
            print("=" * 60)
        
        # Check for actionable failures
        actionable = [h for h in health_reports if h.is_actionable_failure()]
        if actionable:
            print()
            print("❌ ACTIONABLE FAILURES DETECTED:")
            for h in actionable:
                print(f"   {h.symbol}: {h.state.value} - {h.message}")
            # Don't exit 1 here - let validate_stratax_health.py handle it
        
        # Exit 0 even with temporary blocks - the validation script will check health
        sys.exit(0)
    else:
        # Fetch single index
        underlying = args.underlying.upper()
        success, health = save_option_chain_data(
            underlying, args.expiry, output_dir, health_writer, args.quiet
        )
        
        if not args.quiet:
            print()
            if success:
                print("✅ Data fetch completed successfully!")
            else:
                print(f"⚠️  Data fetch completed with state: {health.state.value}")
        
        # Don't exit 1 for temporary blocks - let validation handle it
        sys.exit(0)


if __name__ == "__main__":
    main()
