"""
StrataX Data Provider

This is the SINGLE SOURCE OF TRUTH for data source selection.

Configuration:
- Set environment variable STRATAX_DATA_SOURCE to control data source
- Allowed values: "mock" or "nse"
- Default: "mock" if not set

Data Flow:
1. Read STRATAX_DATA_SOURCE from config
2. If "mock" → use generate_mock_option_chain()
3. If "nse" → use fetch_nse_option_chain() from nse_fetcher
4. If NSE fails → raise NSEDataError (no automatic fallback)

To switch data sources:
1. Set STRATAX_DATA_SOURCE=nse in environment or .env file
2. Restart backend server
3. Check /api/stratax/data-status to verify active source
"""

from typing import List, Optional, Dict
from datetime import datetime, timedelta
import random
import logging

from app.stratax.config import STRATAX_DATA_SOURCE

logger = logging.getLogger(__name__)

# Import NSE fetcher
try:
    from app.stratax.nse_fetcher import (
        fetch_nse_option_chain,
        parse_nse_option_chain,
        NSEDataError,
        get_nse_expiries as fetch_nse_expiries,
    )
    NSE_FETCHER_AVAILABLE = True
except ImportError as e:
    NSE_FETCHER_AVAILABLE = False
    logger.warning(f"NSE fetcher not available: {e}")


def get_next_thursdays(count: int = 4) -> List[str]:
    """Get next N Thursdays as expiry dates."""
    dates = []
    today = datetime.now()
    
    # Find next Thursday
    current = today
    day_of_week = current.weekday()
    days_until_thursday = (3 - day_of_week + 7) % 7 or 7
    current += timedelta(days=days_until_thursday)
    
    for i in range(count):
        expiry = current + timedelta(weeks=i)
        dates.append(expiry.strftime('%Y-%m-%d'))
    
    return dates


def generate_mock_option_chain(underlying: str, spot_price: float, expiry: str) -> dict:
    """Generate mock option chain data."""
    strikes = []
    atm_strike = round(spot_price / 50) * 50  # Round to nearest 50
    
    # Generate strikes around ATM
    for i in range(-20, 21):
        strikes.append(atm_strike + i * 50)
    
    rows = []
    for strike in strikes:
        moneyness = strike / spot_price
        intrinsic_call = max(0, spot_price - strike)
        intrinsic_put = max(0, strike - spot_price)
        time_value = random.uniform(20, 70)
        
        call_ltp = intrinsic_call + time_value * (1 - abs(moneyness - 1) * 0.5)
        put_ltp = intrinsic_put + time_value * (1 - abs(moneyness - 1) * 0.5)
        
        base_iv = random.uniform(0.15, 0.30)
        call_iv = base_iv * (1 + abs(moneyness - 1) * 0.3)
        put_iv = base_iv * (1 + abs(moneyness - 1) * 0.3)
        
        base_oi = random.randint(100000, 1000000)
        base_volume = random.randint(10000, 100000)
        
        rows.append({
            'strike': strike,
            'call': {
                'ltp': max(0.05, call_ltp),
                'change': random.uniform(-10, 10),
                'volume': base_volume + random.randint(0, 50000),
                'oi': base_oi + random.randint(0, 200000),
                'oi_change': random.randint(-50000, 50000),
                'iv': call_iv,
            },
            'put': {
                'ltp': max(0.05, put_ltp),
                'change': random.uniform(-10, 10),
                'volume': base_volume + random.randint(0, 50000),
                'oi': base_oi + random.randint(0, 200000),
                'oi_change': random.randint(-50000, 50000),
                'iv': put_iv,
            },
        })
    
    return {
        'underlying': underlying,
        'expiry': expiry,
        'spot_price': spot_price,
        'rows': rows,
        'timestamp': datetime.now().isoformat(),
    }


# Predefined spot prices for mock data
SPOT_PRICES = {
    'NIFTY': 24500,
    'BANKNIFTY': 52000,
    'FINNIFTY': 18000,
    'MIDCPNIFTY': 12000,
}

MOCK_UNDERLYINGS = list(SPOT_PRICES.keys())


def get_option_chain(underlying: str, expiry: Optional[str] = None) -> dict:
    """
    Get option chain for underlying.
    
    This is the SINGLE ENTRY POINT for all option chain requests.
    Data source is determined by STRATAX_DATA_SOURCE config.
    
    Args:
        underlying: Symbol like 'NIFTY', 'BANKNIFTY', etc.
        expiry: Expiry date in YYYY-MM-DD format or None
    
    Returns:
        Option chain data dict
        
    Raises:
        NSEDataError: If NSE is configured but fetch fails
    """
    # SINGLE DECISION POINT: Check config
    if STRATAX_DATA_SOURCE == "nse":
        # Use NSE data source
        if not NSE_FETCHER_AVAILABLE:
            raise NSEDataError("NSE fetcher not available (import failed)")
        
        try:
            nse_data = fetch_nse_option_chain(underlying, expiry)
            parsed = parse_nse_option_chain(nse_data, underlying, expiry)
            logger.info(f"Successfully fetched NSE data for {underlying}")
            return parsed
        except NSEDataError as e:
            logger.error(f"NSE data fetch failed for {underlying}: {e}")
            raise  # Re-raise, no fallback
        except Exception as e:
            logger.error(f"Unexpected error fetching NSE data for {underlying}: {e}")
            raise NSEDataError(f"Unexpected error: {str(e)}")
    
    elif STRATAX_DATA_SOURCE == "mock":
        # Use mock data source
        logger.debug(f"Using mock data for {underlying}")
        spot_price = SPOT_PRICES.get(underlying, 1000)
        expiries = get_next_thursdays()
        selected_expiry = expiry or expiries[0]
        
        return generate_mock_option_chain(underlying, spot_price, selected_expiry)
    
    else:
        # Should never happen (config validates), but fallback to mock
        logger.error(f"Unknown data source: {STRATAX_DATA_SOURCE}, using mock")
        spot_price = SPOT_PRICES.get(underlying, 1000)
        expiries = get_next_thursdays()
        selected_expiry = expiry or expiries[0]
        return generate_mock_option_chain(underlying, spot_price, selected_expiry)


def get_available_expiries(underlying: str) -> List[str]:
    """
    Get available expiry dates for an underlying.
    
    Uses configured data source (NSE or mock).
    """
    if STRATAX_DATA_SOURCE == "nse" and NSE_FETCHER_AVAILABLE:
        try:
            expiries = fetch_nse_expiries(underlying)
            if expiries:
                return expiries
        except Exception as e:
            logger.warning(f"Failed to get NSE expiries: {e}, using mock")
    
    # Fallback to mock expiries
    return get_next_thursdays()


def get_available_underlyings() -> List[str]:
    """
    Get list of available underlyings.
    
    For NSE: Returns supported index symbols
    For mock: Returns predefined list
    """
    if STRATAX_DATA_SOURCE == "nse":
        # NSE supports these indices
        return ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
    
    # Mock underlyings
    return list(MOCK_UNDERLYINGS)
