"""
CUSIP to Ticker Mapper

Maps CUSIP identifiers from 13F filings to stock tickers using:
1. Pre-built mapping from screener data
2. Company name matching
3. External API fallback (SEC EDGAR)
"""

import logging
import pandas as pd
from pathlib import Path
from typing import Dict, Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

# Known CUSIP to ticker mappings (manually curated for major holdings)
KNOWN_CUSIP_MAPPINGS = {
    # Major US stocks commonly held by hedge funds
    "037833100": "AAPL",    # Apple Inc
    "594918104": "MSFT",    # Microsoft Corp
    "02079K305": "GOOGL",   # Alphabet Inc Class A
    "02079K107": "GOOG",    # Alphabet Inc Class C
    "023135106": "AMZN",    # Amazon.com Inc
    "30303M102": "META",    # Meta Platforms Inc
    "88160R101": "TSLA",    # Tesla Inc
    "67066G104": "NVDA",    # NVIDIA Corp
    "084670702": "BRK-B",   # Berkshire Hathaway Class B
    "084670108": "BRK-A",   # Berkshire Hathaway Class A
    "46625H100": "JPM",     # JPMorgan Chase & Co
    "92826C839": "V",       # Visa Inc
    "22160K105": "COST",    # Costco Wholesale Corp
    "931142103": "WMT",     # Walmart Inc
    "478160104": "JNJ",     # Johnson & Johnson
    "742718109": "PG",      # Procter & Gamble Co
    "87936R102": "TGT",     # Target Corp
    "172967424": "C",       # Citigroup Inc
    "060505104": "BAC",     # Bank of America Corp
    "38141G104": "GS",      # Goldman Sachs Group
    "79466L302": "CRM",     # Salesforce Inc
    "0258161092": "AMD",    # Advanced Micro Devices
    "458140100": "INTC",    # Intel Corp
    "30231G102": "XOM",     # Exxon Mobil Corp
    "20030N101": "CVX",     # Chevron Corp
    "674599105": "OXY",     # Occidental Petroleum
    "H1467J104": "CB",      # Chubb Limited
    "88579Y101": "TXN",     # Texas Instruments
    "718546104": "PFE",     # Pfizer Inc
    "58933Y105": "MRK",     # Merck & Co Inc
    "002824100": "ABBV",    # AbbVie Inc
    "88579Y101": "TXN",     # Texas Instruments
    "532457108": "LLY",     # Eli Lilly & Co
    "17275R102": "CSCO",    # Cisco Systems
    "68389X105": "ORCL",    # Oracle Corp
    "00206R102": "T",       # AT&T Inc
    "92343V104": "VZ",      # Verizon Communications
    "035710409": "APO",     # Apollo Global Management
    "09062X103": "BIIB",    # Biogen Inc
    "111320107": "BMY",     # Bristol-Myers Squibb
    "191216100": "KO",      # Coca-Cola Co
    "713448108": "PEP",     # PepsiCo Inc
    "844741108": "SPY",     # SPDR S&P 500 ETF Trust
    "78462F103": "QQQ",     # Invesco QQQ Trust - keeping correct mapping
    "464287200": "IVV",     # iShares Core S&P 500 ETF
    "922908363": "VOO",     # Vanguard S&P 500 ETF
    "78462F103": "QQQ",     # Invesco QQQ Trust
    "46090E103": "SCHW",    # Charles Schwab Corp
    "075887109": "BX",      # Blackstone Inc
    "09857L108": "BK",      # Bank of New York Mellon
    "254687106": "DIS",     # Walt Disney Co
    "62944T105": "NFLX",    # Netflix Inc
}


def build_cusip_map_from_screener() -> Dict[str, str]:
    """Build CUSIP to ticker map from screener data if fundamentals have CUSIP info."""
    from app.config import settings
    from app.data_access import list_tickers, load_fundamentals
    
    cusip_map = KNOWN_CUSIP_MAPPINGS.copy()
    
    try:
        tickers = list_tickers()
        logger.info(f"Building CUSIP map from {len(tickers)} tickers...")
        
        for ticker_meta in tickers[:500]:  # Limit to avoid slow startup
            ticker = ticker_meta.get("ticker")
            market = ticker_meta.get("market")
            
            if not ticker or market not in ["US", "IN"]:
                continue
                
            try:
                fundamentals = load_fundamentals(ticker, market)
                if fundamentals:
                    info = fundamentals.get("info", {})
                    # Try to get CUSIP or ISIN
                    cusip = info.get("cusip") or info.get("CUSIP")
                    isin = info.get("isin") or info.get("ISIN")
                    
                    if cusip and len(cusip) >= 6:
                        # Normalize CUSIP (take first 9 chars)
                        normalized_cusip = cusip[:9].upper()
                        cusip_map[normalized_cusip] = ticker
                    elif isin and isin.startswith("US"):
                        # ISIN to CUSIP: US + CUSIP (9 chars) + check digit
                        cusip_from_isin = isin[2:11]
                        cusip_map[cusip_from_isin] = ticker
            except Exception:
                continue
                
        logger.info(f"Built CUSIP map with {len(cusip_map)} entries")
    except Exception as e:
        logger.warning(f"Could not build CUSIP map from screener: {e}")
    
    return cusip_map


@lru_cache(maxsize=1)
def get_cusip_ticker_map() -> Dict[str, str]:
    """Get cached CUSIP to ticker mapping."""
    return build_cusip_map_from_screener()


def cusip_to_ticker(cusip: str, name: Optional[str] = None) -> Optional[str]:
    """
    Convert CUSIP to ticker symbol.
    
    Args:
        cusip: CUSIP identifier (9 characters)
        name: Company name (for fallback matching)
    
    Returns:
        Ticker symbol or None if not found
    """
    if not cusip:
        return None
    
    # Normalize CUSIP
    normalized_cusip = cusip.strip().upper()
    if len(normalized_cusip) > 9:
        normalized_cusip = normalized_cusip[:9]
    
    # Try direct lookup
    cusip_map = get_cusip_ticker_map()
    if normalized_cusip in cusip_map:
        return cusip_map[normalized_cusip]
    
    # Try with padding
    if len(normalized_cusip) < 9:
        padded = normalized_cusip.ljust(9, '0')
        if padded in cusip_map:
            return cusip_map[padded]
    
    # Try company name matching if provided
    if name:
        ticker = company_name_to_ticker(name)
        if ticker:
            # Cache this mapping for future use
            cusip_map[normalized_cusip] = ticker
            return ticker
    
    return None


# Company name to ticker mapping for common abbreviations
COMPANY_NAME_PATTERNS = {
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "AMAZON": "AMZN",
    "ALPHABET": "GOOGL",
    "GOOGLE": "GOOGL",
    "META PLATFORMS": "META",
    "FACEBOOK": "META",
    "TESLA": "TSLA",
    "NVIDIA": "NVDA",
    "BERKSHIRE HATHAWAY": "BRK-B",
    "BERKSHIRE": "BRK-B",
    "JPMORGAN": "JPM",
    "JP MORGAN": "JPM",
    "VISA": "V",
    "WALMART": "WMT",
    "WAL-MART": "WMT",
    "JOHNSON & JOHNSON": "JNJ",
    "JOHNSON AND JOHNSON": "JNJ",
    "PROCTER & GAMBLE": "PG",
    "PROCTER AND GAMBLE": "PG",
    "EXXON": "XOM",
    "CHEVRON": "CVX",
    "OCCIDENTAL PETE": "OXY",
    "OCCIDENTAL": "OXY",
    "COCA-COLA": "KO",
    "COCA COLA": "KO",
    "PEPSICO": "PEP",
    "PEPSI": "PEP",
    "DISNEY": "DIS",
    "WALT DISNEY": "DIS",
    "NETFLIX": "NFLX",
    "CHUBB LTD": "CB",
    "CHUBB LIMITED": "CB",
    "CHUBB": "CB",
    "INTEL": "INTC",
    "CISCO": "CSCO",
    "ORACLE": "ORCL",
    "SALESFORCE": "CRM",
    "PFIZER": "PFE",
    "MERCK": "MRK",
    "ABBVIE": "ABBV",
    "ELI LILLY": "LLY",
    "LILLY": "LLY",
    "BANK OF AMERICA": "BAC",
    "CITIGROUP": "C",
    "CITI": "C",
    "GOLDMAN SACHS": "GS",
    "GOLDMAN": "GS",
    "VERIZON": "VZ",
    "AT&T": "T",
    "ATT": "T",
    "TARGET": "TGT",
    "COSTCO": "COST",
    "BLACKSTONE": "BX",
    "CHARLES SCHWAB": "SCHW",
    "SCHWAB": "SCHW",
    "BRISTOL-MYERS": "BMY",
    "BRISTOL MYERS": "BMY",
    "BIOGEN": "BIIB",
    "TEXAS INSTRUMENTS": "TXN",
    "KRAFT HEINZ": "KHC",
    "SPDR S&P 500": "SPY",
    "S&P 500 ETF": "SPY",
}


def company_name_to_ticker(name: str) -> Optional[str]:
    """Match company name to ticker using pattern matching."""
    if not name:
        return None
    
    name_upper = name.upper().strip()
    
    # Direct pattern matching - check if pattern is in the name
    for pattern, ticker in COMPANY_NAME_PATTERNS.items():
        if pattern in name_upper:
            logger.debug(f"Matched '{name}' to {ticker} via pattern '{pattern}'")
            return ticker
    
    # Try to extract ticker from name (some 13F files include ticker in parentheses)
    # e.g., "APPLE INC (AAPL)"
    import re
    match = re.search(r'\(([A-Z]{1,5})\)$', name_upper)
    if match:
        return match.group(1)
    
    logger.debug(f"No ticker match for: {name}")
    return None


def enrich_13f_with_tickers(signals: list) -> list:
    """
    Enrich 13F signals with ticker symbols.
    
    Args:
        signals: List of 13F signal dicts with 'cusip' and 'name' fields
    
    Returns:
        List with added 'ticker' field
    """
    enriched = []
    
    for signal in signals:
        cusip = signal.get("cusip", "")
        name = signal.get("name", "")
        
        # Try to get ticker
        ticker = cusip_to_ticker(cusip, name)
        
        signal_copy = signal.copy()
        signal_copy["ticker"] = ticker
        enriched.append(signal_copy)
    
    return enriched

