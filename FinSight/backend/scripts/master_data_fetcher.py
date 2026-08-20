"""
Master data fetcher - runs daily to update screener snapshot from existing data.
This script uses ONLY existing data files, no external API calls.
"""
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.screener_snapshot import build_screener_snapshot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

if __name__ == "__main__":
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("Master Data Fetcher - Building Screener Snapshot")
    logger.info("=" * 60)
    
    try:
        df = build_screener_snapshot()
        logger.info("=" * 60)
        logger.info(f"SUCCESS: Built screener snapshot with {len(df)} tickers")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"FAILED: {e}", exc_info=True)
        sys.exit(1)
