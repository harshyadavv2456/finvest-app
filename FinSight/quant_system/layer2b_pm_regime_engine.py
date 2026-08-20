"""
LAYER 2B: Precious Metals Regime Engine
========================================

MACRO CONTEXT MODIFIER using Gold and Silver ETF data.

This layer provides SYSTEMIC RISK CONTEXT that modifies:
- INITIATE strictness (harder in RISK_OFF)
- EXIT urgency (higher when stock weak + RISK_OFF)
- HOLD tolerance (reduced in RISK_OFF)

It does NOT:
- Create INITIATE signals
- Recommend buying/selling Gold or Silver
- Override risk stops or ethics layers
- Introduce new decision types

Inputs:
- GOLDBEES.NS (Gold ETF)
- SILVERBEES.NS (Silver ETF)
- Market benchmark (NIFTY50)

Output Schema:
{
    "state": "RISK_ON" | "TRANSITION" | "RISK_OFF",
    "confidence": 0-100,
    "triggers": ["gold_strength", "silver_weakness", etc.],
    "date": "YYYY-MM-DD",
    "context_description": "Human-readable context"
}

FAIL-OPEN BEHAVIOR: If PM data is missing, returns neutral state and
system behaves exactly as before.
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional, List, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass, asdict
from pathlib import Path
import logging
import json

logger = logging.getLogger(__name__)

# Import config for data directories
try:
    from .config import DATA_DIR
except ImportError:
    DATA_DIR = Path(__file__).parent.parent / "data"


# =============================================================================
# PM REGIME STATE DEFINITIONS
# =============================================================================

class PMRegimeState:
    """PM Regime states - NOT trading signals, just macro context."""
    RISK_ON = "RISK_ON"      # Equities favored, gold weak
    TRANSITION = "TRANSITION"  # Mixed signals, heightened uncertainty
    RISK_OFF = "RISK_OFF"    # Defensive positioning, gold strong


@dataclass
class PMRegimeOutput:
    """
    Output from PM Regime Engine.
    
    This is a CONTEXT MODIFIER, not a trading signal.
    It affects how strictly other decisions are evaluated.
    """
    state: str                    # RISK_ON, TRANSITION, RISK_OFF
    confidence: float             # 0-100
    triggers: List[str]           # What triggered this state
    date: str                     # YYYY-MM-DD
    
    # Technical levels (for auditing)
    gold_above_20dma: bool
    gold_above_50dma: bool
    gold_above_200dma: bool
    silver_above_20dma: bool
    silver_above_50dma: bool
    gold_silver_ratio_trend: str  # "rising", "falling", "neutral"
    gold_vs_nifty_strength: float # Relative strength score
    
    # Contextual interpretation
    context_description: str
    
    # Yesterday comparison (for memory)
    previous_state: Optional[str] = None
    state_changed: bool = False
    days_in_current_state: int = 1
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# =============================================================================
# PM REGIME ENGINE
# =============================================================================

class PMRegimeEngine:
    """
    Precious Metals Regime Engine.
    
    Computes macro risk context from Gold and Silver ETF data.
    This is NOT a trading signal generator - it's a context modifier.
    
    Integration points:
    - Layer 6 (Decision Engine): Affects INITIATE/EXIT/HOLD thresholds
    - Simulator/Intelligence UI: Shows contextual badge
    """
    
    # PM Tickers (India)
    GOLD_TICKER = "GOLDBEES.NS"
    SILVER_TICKER = "SILVERBEES.NS"
    
    # Benchmark for relative strength
    NIFTY_TICKERS = ["^NSEI", "NIFTY50.NS", "NIFTYBEES.NS"]
    
    # Regime interpretation
    REGIME_DESCRIPTIONS = {
        PMRegimeState.RISK_ON: "Equities favored - Gold showing relative weakness",
        PMRegimeState.TRANSITION: "Mixed signals - Heightened uncertainty, neutral bias",
        PMRegimeState.RISK_OFF: "Defensive positioning - Gold showing relative strength vs equities"
    }
    
    def __init__(self):
        self._cache = {}
        self._yesterday_state: Optional[str] = None
        self._days_in_state: int = 1
    
    def _load_price_data(self, ticker: str, market: str = "IN") -> Optional[pd.DataFrame]:
        """Load price data for a ticker. FAIL-OPEN if not available."""
        try:
            # Try multiple paths
            paths_to_try = [
                DATA_DIR / market / ticker / "history.parquet",
                DATA_DIR / market / ticker.replace(".NS", "") / "history.parquet",
                DATA_DIR / "IN" / ticker / "history.parquet",
            ]
            
            for path in paths_to_try:
                if path.exists():
                    df = pd.read_parquet(path)
                    
                    # Normalize columns
                    df.columns = [c.lower() for c in df.columns]
                    
                    # Ensure date column
                    if 'date' not in df.columns and df.index.name == 'Date':
                        df = df.reset_index()
                        df.columns = [c.lower() for c in df.columns]
                    
                    return df
            
            logger.debug(f"No price data found for {ticker}")
            return None
            
        except Exception as e:
            logger.debug(f"Error loading {ticker}: {e}")
            return None
    
    def _compute_dma_signals(self, prices: pd.DataFrame) -> Dict:
        """Compute DMA signals from price data."""
        if prices is None or len(prices) < 200:
            return {
                "above_20dma": None,
                "above_50dma": None,
                "above_200dma": None,
                "trend_20_50": None,
                "current_price": None
            }
        
        close = prices['close']
        current = close.iloc[-1]
        
        dma_20 = close.rolling(20).mean().iloc[-1]
        dma_50 = close.rolling(50).mean().iloc[-1]
        dma_200 = close.rolling(200).mean().iloc[-1] if len(close) >= 200 else None
        
        return {
            "above_20dma": current > dma_20 if dma_20 else None,
            "above_50dma": current > dma_50 if dma_50 else None,
            "above_200dma": current > dma_200 if dma_200 else None,
            "trend_20_50": "bullish" if dma_20 and dma_50 and dma_20 > dma_50 else "bearish",
            "current_price": current
        }
    
    def _compute_relative_strength(
        self, 
        asset_prices: pd.DataFrame, 
        benchmark_prices: pd.DataFrame,
        lookback: int = 20
    ) -> float:
        """
        Compute relative strength of asset vs benchmark.
        
        Returns: -1 to +1 score
            Positive = asset outperforming
            Negative = asset underperforming
        """
        if asset_prices is None or benchmark_prices is None:
            return 0.0
        
        try:
            # Align dates
            asset = asset_prices.set_index('date')['close']
            bench = benchmark_prices.set_index('date')['close']
            
            # Use last N days
            asset = asset.iloc[-lookback:]
            bench = bench.iloc[-lookback:]
            
            # Compute returns
            asset_ret = (asset.iloc[-1] / asset.iloc[0]) - 1
            bench_ret = (bench.iloc[-1] / bench.iloc[0]) - 1
            
            # Relative strength: asset return - benchmark return, scaled
            rel_strength = asset_ret - bench_ret
            
            # Clip to [-1, 1]
            return float(np.clip(rel_strength * 5, -1, 1))
            
        except Exception as e:
            logger.debug(f"Error computing relative strength: {e}")
            return 0.0
    
    def _compute_gold_silver_ratio_trend(
        self,
        gold_prices: pd.DataFrame,
        silver_prices: pd.DataFrame
    ) -> str:
        """
        Compute Gold/Silver ratio trend.
        
        Rising ratio = flight to quality (RISK_OFF signal)
        Falling ratio = risk appetite (RISK_ON signal)
        """
        if gold_prices is None or silver_prices is None:
            return "neutral"
        
        try:
            gold = gold_prices.set_index('date')['close'].iloc[-50:]
            silver = silver_prices.set_index('date')['close'].iloc[-50:]
            
            # Align
            common_idx = gold.index.intersection(silver.index)
            if len(common_idx) < 20:
                return "neutral"
            
            gold = gold.loc[common_idx]
            silver = silver.loc[common_idx]
            
            # Compute ratio
            ratio = gold / silver
            
            # Trend: compare current ratio to 20-day MA
            current_ratio = ratio.iloc[-1]
            ma_20 = ratio.rolling(20).mean().iloc[-1]
            
            if current_ratio > ma_20 * 1.02:
                return "rising"  # Flight to quality
            elif current_ratio < ma_20 * 0.98:
                return "falling"  # Risk appetite
            else:
                return "neutral"
                
        except Exception as e:
            logger.debug(f"Error computing G/S ratio: {e}")
            return "neutral"
    
    def compute_pm_regime(
        self,
        as_of_date: Optional[date] = None,
        previous_state: Optional[str] = None
    ) -> PMRegimeOutput:
        """
        Compute current PM Regime state.
        
        FAIL-OPEN: Returns neutral TRANSITION state if data unavailable.
        System continues to operate exactly as before.
        """
        as_of_date = as_of_date or date.today()
        date_str = as_of_date.strftime("%Y-%m-%d")
        
        # Load data (FAIL-OPEN on each)
        gold_prices = self._load_price_data(self.GOLD_TICKER)
        silver_prices = self._load_price_data(self.SILVER_TICKER)
        
        # Load benchmark
        nifty_prices = None
        for ticker in self.NIFTY_TICKERS:
            nifty_prices = self._load_price_data(ticker)
            if nifty_prices is not None:
                break
        
        # FAIL-OPEN: If no PM data, return neutral state
        if gold_prices is None and silver_prices is None:
            logger.info("PM Regime: No precious metals data - using neutral state (FAIL-OPEN)")
            return PMRegimeOutput(
                state=PMRegimeState.TRANSITION,
                confidence=0,
                triggers=["no_pm_data"],
                date=date_str,
                gold_above_20dma=False,
                gold_above_50dma=False,
                gold_above_200dma=False,
                silver_above_20dma=False,
                silver_above_50dma=False,
                gold_silver_ratio_trend="neutral",
                gold_vs_nifty_strength=0.0,
                context_description="PM data unavailable - neutral macro context",
                previous_state=previous_state,
                state_changed=False,
                days_in_current_state=1
            )
        
        # Compute signals
        gold_dma = self._compute_dma_signals(gold_prices)
        silver_dma = self._compute_dma_signals(silver_prices)
        gs_ratio_trend = self._compute_gold_silver_ratio_trend(gold_prices, silver_prices)
        gold_vs_nifty = self._compute_relative_strength(gold_prices, nifty_prices)
        
        # =================================================================
        # REGIME CLASSIFICATION
        # =================================================================
        triggers = []
        risk_off_score = 0
        risk_on_score = 0
        
        # Gold DMA signals
        if gold_dma["above_20dma"]:
            risk_off_score += 1
            triggers.append("gold_above_20dma")
        else:
            risk_on_score += 1
        
        if gold_dma["above_50dma"]:
            risk_off_score += 1
            triggers.append("gold_above_50dma")
        else:
            risk_on_score += 1
        
        if gold_dma["above_200dma"]:
            risk_off_score += 1.5
            triggers.append("gold_above_200dma")
        else:
            risk_on_score += 0.5
        
        # Silver DMA signals (less weight than gold)
        if silver_dma["above_20dma"]:
            risk_off_score += 0.5
            triggers.append("silver_above_20dma")
        
        if silver_dma["above_50dma"]:
            risk_off_score += 0.5
            triggers.append("silver_above_50dma")
        
        # Gold/Silver ratio trend
        if gs_ratio_trend == "rising":
            risk_off_score += 1
            triggers.append("gs_ratio_rising_flight_to_quality")
        elif gs_ratio_trend == "falling":
            risk_on_score += 1
            triggers.append("gs_ratio_falling_risk_appetite")
        
        # Gold vs Nifty relative strength (strongest signal)
        if gold_vs_nifty > 0.3:
            risk_off_score += 2
            triggers.append("gold_outperforming_nifty")
        elif gold_vs_nifty < -0.3:
            risk_on_score += 2
            triggers.append("gold_underperforming_nifty")
        
        # =================================================================
        # DETERMINE STATE
        # =================================================================
        total_score = risk_off_score - risk_on_score
        
        if total_score >= 2:
            state = PMRegimeState.RISK_OFF
            confidence = min(100, 50 + total_score * 10)
        elif total_score <= -2:
            state = PMRegimeState.RISK_ON
            confidence = min(100, 50 + abs(total_score) * 10)
        else:
            state = PMRegimeState.TRANSITION
            confidence = max(30, 50 - abs(total_score) * 10)
        
        # State change detection
        state_changed = previous_state is not None and previous_state != state
        days_in_state = 1 if state_changed else (self._days_in_state + 1)
        
        # Update internal state
        self._yesterday_state = state
        self._days_in_state = days_in_state
        
        return PMRegimeOutput(
            state=state,
            confidence=confidence,
            triggers=triggers,
            date=date_str,
            gold_above_20dma=gold_dma["above_20dma"] or False,
            gold_above_50dma=gold_dma["above_50dma"] or False,
            gold_above_200dma=gold_dma["above_200dma"] or False,
            silver_above_20dma=silver_dma["above_20dma"] or False,
            silver_above_50dma=silver_dma["above_50dma"] or False,
            gold_silver_ratio_trend=gs_ratio_trend,
            gold_vs_nifty_strength=gold_vs_nifty,
            context_description=self.REGIME_DESCRIPTIONS.get(state, ""),
            previous_state=previous_state,
            state_changed=state_changed,
            days_in_current_state=days_in_state
        )
    
    def get_decision_modifiers(self, pm_regime: PMRegimeOutput) -> Dict:
        """
        Get decision modifiers based on PM regime.
        
        These modifiers affect Layer 6 decisions:
        - initiate_strictness: Higher = harder to INITIATE
        - exit_urgency: Higher = faster EXIT on weakness
        - hold_tolerance: Higher = more forgiving HOLD
        
        Returns modifiers in [0.8, 1.2] range for smooth integration.
        """
        if pm_regime.state == PMRegimeState.RISK_OFF:
            return {
                "initiate_strictness": 1.15,    # 15% harder to INITIATE
                "exit_urgency": 1.10,           # 10% faster EXIT
                "hold_tolerance": 0.90,         # 10% less forgiving HOLD
                "context_note": "Defensive context: PM showing strength vs equities"
            }
        elif pm_regime.state == PMRegimeState.RISK_ON:
            return {
                "initiate_strictness": 0.95,    # 5% easier to INITIATE
                "exit_urgency": 0.95,           # 5% slower EXIT
                "hold_tolerance": 1.05,         # 5% more forgiving HOLD
                "context_note": "Constructive context: Equities favored"
            }
        else:  # TRANSITION
            return {
                "initiate_strictness": 1.0,     # No change
                "exit_urgency": 1.0,            # No change
                "hold_tolerance": 1.0,          # No change
                "context_note": "Neutral context: Mixed PM signals"
            }


# =============================================================================
# PERSISTENCE / TIMELINE
# =============================================================================

def save_pm_regime_to_timeline(
    pm_regime: PMRegimeOutput,
    timeline_dir: Path
) -> bool:
    """
    Save PM regime to timeline directory alongside other snapshots.
    
    File: timeline/{market}/pm_regime_{date}.json
    """
    try:
        # Create directory
        pm_dir = timeline_dir / "IN"  # PM is India-specific
        pm_dir.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        filename = f"pm_regime_{pm_regime.date}.json"
        filepath = pm_dir / filename
        
        with open(filepath, 'w') as f:
            f.write(pm_regime.to_json())
        
        logger.info(f"Saved PM regime to {filepath}")
        return True
        
    except Exception as e:
        logger.error(f"Error saving PM regime: {e}")
        return False


def load_pm_regime_from_timeline(
    date_str: str,
    timeline_dir: Path
) -> Optional[PMRegimeOutput]:
    """Load PM regime from timeline for a specific date."""
    try:
        filepath = timeline_dir / "IN" / f"pm_regime_{date_str}.json"
        
        if not filepath.exists():
            return None
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        return PMRegimeOutput(**data)
        
    except Exception as e:
        logger.debug(f"Error loading PM regime for {date_str}: {e}")
        return None


def get_yesterday_pm_regime(timeline_dir: Path) -> Optional[str]:
    """Get yesterday's PM regime state for comparison."""
    yesterday = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    regime = load_pm_regime_from_timeline(yesterday, timeline_dir)
    return regime.state if regime else None


# =============================================================================
# INTEGRATION HELPER
# =============================================================================

def get_pm_context_for_intelligence(
    pm_regime: PMRegimeOutput
) -> Dict:
    """
    Get PM context formatted for intelligence output.
    
    This is what gets embedded in the intelligence JSON for each stock.
    """
    return {
        "pm_regime_state": pm_regime.state,
        "pm_regime_confidence": pm_regime.confidence,
        "pm_regime_triggers": pm_regime.triggers[:3],  # Top 3 triggers
        "pm_context_description": pm_regime.context_description,
        "pm_regime_changed": pm_regime.state_changed,
        "pm_previous_state": pm_regime.previous_state
    }


def is_pm_ticker(ticker: str) -> bool:
    """
    Check if a ticker is a PM ETF.
    
    These should NEVER appear as recommendations.
    """
    pm_tickers = {
        "GOLDBEES.NS", "GOLDBEES", 
        "SILVERBEES.NS", "SILVERBEES",
        "GOLDSHARE.NS", "GOLDSHARE"
    }
    return ticker.upper().replace(".NS", "").replace("-", "") in {t.replace(".NS", "") for t in pm_tickers}

