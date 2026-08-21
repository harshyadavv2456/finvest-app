"""
Pydantic schemas for StrataX API.
"""

from typing import Optional, List, Literal
from pydantic import BaseModel


class StrataXOptionRow(BaseModel):
    """Canonical option row schema matching CSV structure."""
    symbol: str
    kind: Literal["index", "equity"]
    underlying: Optional[str] = None
    underlyingValue: Optional[float] = None
    timestamp: Optional[str] = None
    expiryDate: str
    strikePrice: float
    optionType: Literal["CE", "PE"]
    lastPrice: Optional[float] = None
    change: Optional[float] = None
    pChange: Optional[float] = None
    openInterest: Optional[int] = None
    changeInOI: Optional[int] = None
    totalTradedVolume: Optional[int] = None
    impliedVolatility: Optional[float] = None
    bidQty: Optional[int] = None
    bidPrice: Optional[float] = None
    askPrice: Optional[float] = None
    askQty: Optional[int] = None
    identifier: Optional[str] = None
    # Greeks - populated from AngelOne's optionGreek endpoint when the
    # chain comes from AngelOne (see angelone_option_chain.py); None for
    # CSV-sourced rows, which never had these. Sensibull-style display.
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None


class OptionChainResponse(BaseModel):
    """Response containing list of option rows."""
    rows: List[StrataXOptionRow]


# Legacy schemas (deprecated, kept for backward compatibility during migration)
class OptionChainRow(BaseModel):
    strike: float
    call: dict
    put: dict


class LegacyOptionChainResponse(BaseModel):
    underlying: str
    expiry: str
    spot_price: float
    rows: List[OptionChainRow]
    timestamp: str


class OptionLeg(BaseModel):
    id: str
    underlying: str
    expiry: str
    option_type: str  # 'CALL' or 'PUT'
    action: str  # 'BUY' or 'SELL'
    strike: float
    quantity: int
    entry_price: float


class Strategy(BaseModel):
    id: str
    name: Optional[str] = None
    legs: List[OptionLeg]
    created_at: str
    updated_at: str


class PaperTrade(BaseModel):
    id: str
    name: str
    strategy: Strategy
    entry_timestamp: str
    current_pnl: Optional[float] = None
    notes: Optional[str] = None



class ChainAnalytics(BaseModel):
    """Sensibull-style option chain summary metrics - Workstream D
    "pro level" analytics, computed purely from real OI/LTP already in
    the chain, no invented numbers."""
    available: bool
    spot: Optional[float] = None
    max_pain: Optional[float] = None
    pcr_oi: Optional[float] = None
    atm_straddle_price: Optional[float] = None
    total_call_oi: Optional[int] = None
    total_put_oi: Optional[int] = None
    total_call_volume: Optional[int] = None
    total_put_volume: Optional[int] = None
    resistance_strike: Optional[float] = None
    support_strike: Optional[float] = None
