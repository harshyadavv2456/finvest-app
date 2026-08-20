#!/usr/bin/env python3
"""
FinVest Data Refresh - Main Entry Point

PHASE 43: Real Deployment & Paper Mode Go-Live

Usage:
    python -m data_refresh               # Full daily simulation
    python -m data_refresh --market-only # Market data + screener only
    python -m data_refresh --signals     # Signals only
    python -m data_refresh --positions   # Positions only
    python -m data_refresh --quick       # Quick mode (skip heavy refreshes)
"""

import sys
import argparse
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="FinVest Data Refresh Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python -m data_refresh                  # Full daily simulation
    python -m data_refresh --market-only    # Market data + screener only
    python -m data_refresh --signals        # Signals only
    python -m data_refresh --positions      # Positions only
    python -m data_refresh --quick          # Quick mode (skip heavy refreshes)
        """
    )
    
    parser.add_argument("--market-only", action="store_true", help="Only refresh market data")
    parser.add_argument("--signals", action="store_true", help="Only refresh signals")
    parser.add_argument("--positions", action="store_true", help="Only refresh positions")
    parser.add_argument("--quick", action="store_true", help="Quick mode - skip heavy refreshes")
    parser.add_argument("--skip-stock-data", action="store_true", help="Skip stock data (takes hours)")
    parser.add_argument("--skip-intelligence", action="store_true", help="Skip intelligence pipeline")
    
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("FINVEST DATA REFRESH PIPELINE")
    logger.info(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)
    
    exit_code = 0
    
    if args.market_only:
        from data_refresh.refresh_market_data import main as market_main
        exit_code = market_main()
        
    elif args.signals:
        from data_refresh.refresh_signals import main as signals_main
        exit_code = signals_main()
        
    elif args.positions:
        from data_refresh.refresh_positions import main as positions_main
        exit_code = positions_main()
        
    else:
        # Full daily simulation
        from data_refresh.run_daily_simulation import run_daily_simulation, SimulationConfig
        
        if args.quick or args.skip_stock_data:
            SimulationConfig.SKIP_STOCK_DATA = True
        if args.skip_intelligence:
            SimulationConfig.SKIP_INTELLIGENCE = True
        
        results = run_daily_simulation()
        
        if results.get("summary", {}).get("failures", 0) > 0:
            exit_code = 1
    
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

