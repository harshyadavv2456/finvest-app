#!/usr/bin/env python3
"""
================================================================================
PORTFOLIO INTELLIGENCE LAYER - v2.3-authority
================================================================================

Top-down portfolio control layer that aggregates individual stock intelligence
into portfolio-level decisions.

This is the FINAL decision authority for capital allocation.

OUTPUT:
- Portfolio risk regime
- Capital deployment recommendation
- Position scaling mode
- New position limits
- Dominant risk factors

This module runs AFTER all stock intelligence is generated.

================================================================================
"""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from enum import Enum

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
INTELLIGENCE_DIR = PROJECT_ROOT / 'public' / 'intelligence'


class RiskRegime(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class PositionScalingMode(Enum):
    AGGRESSIVE = "aggressive"
    SELECTIVE = "selective"
    DEFENSIVE = "defensive"


class DominantRiskFactor(Enum):
    VOLATILITY = "volatility"
    CORRELATION = "correlation"
    DRAWDOWN = "drawdown"


@dataclass
class PortfolioIntelligence:
    """
    Portfolio-level intelligence output.
    
    This is the TOP-DOWN control layer that governs all position decisions.
    """
    # Core regime
    risk_regime: str
    market_regime: str
    
    # Capital allocation
    capital_deployment_recommended_pct: float
    cash_hold_recommended_pct: float
    
    # Position control
    new_positions_allowed: bool
    position_scaling_mode: str
    max_new_positions_today: int
    
    # Risk analysis
    dominant_risk_factor: str
    aggregate_cvar_95: float
    aggregate_volatility: float
    correlation_drag: float
    
    # Summary
    portfolio_summary_explanation: str
    
    # Metadata
    generated_at: str
    version: str
    stocks_analyzed: int
    market: str
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def compute_portfolio_intelligence(
    stock_intelligence_list: List[Dict],
    market: str,
    version: str = "v2.3-authority"
) -> PortfolioIntelligence:
    """
    Compute portfolio-level intelligence from individual stock outputs.
    
    This aggregates:
    - CVaR across all stocks
    - Volatility regimes
    - Regime distribution
    - Intent distribution
    
    And produces capital allocation recommendations.
    """
    if not stock_intelligence_list:
        raise ValueError("Cannot compute portfolio intelligence with empty stock list")
    
    # Aggregate metrics
    cvars = []
    volatilities = []
    regimes = []
    intents = []
    convictions = []
    
    for intel in stock_intelligence_list:
        # CVaR
        cvar = intel.get('cvar_95') or intel.get('cvar_bucket')
        if isinstance(cvar, (int, float)):
            cvars.append(cvar)
        elif isinstance(cvar, str):
            # Map bucket to approximate value
            bucket_map = {'low': -0.03, 'moderate': -0.06, 'high': -0.10, 'extreme': -0.15}
            cvars.append(bucket_map.get(cvar.lower(), -0.08))
        
        # Volatility
        vol = intel.get('volatility_20d', 0)
        if vol:
            volatilities.append(vol)
        
        # Regimes
        regime = intel.get('asset_regime', 'unknown')
        regimes.append(regime)
        
        # Intents
        intent = intel.get('intent', 'HOLD')
        intents.append(intent)
        
        # Convictions
        conv = intel.get('conviction', 0.5)
        convictions.append(conv)
    
    # Calculate aggregate metrics
    avg_cvar = sum(cvars) / len(cvars) if cvars else -0.08
    avg_volatility = sum(volatilities) / len(volatilities) if volatilities else 0.25
    avg_conviction = sum(convictions) / len(convictions) if convictions else 0.5
    
    # Count regimes
    regime_counts = {}
    for r in regimes:
        regime_counts[r] = regime_counts.get(r, 0) + 1
    
    # Dominant market regime
    dominant_regime = max(regime_counts, key=regime_counts.get) if regime_counts else 'unknown'
    
    # Count intents
    intent_counts = {}
    for i in intents:
        intent_counts[i] = intent_counts.get(i, 0) + 1
    
    # Determine risk regime
    if avg_cvar < -0.12 or avg_volatility > 0.35:
        risk_regime = RiskRegime.HIGH.value
    elif avg_cvar < -0.07 or avg_volatility > 0.25:
        risk_regime = RiskRegime.MODERATE.value
    else:
        risk_regime = RiskRegime.LOW.value
    
    # Determine dominant risk factor
    if avg_volatility > 0.30:
        dominant_risk = DominantRiskFactor.VOLATILITY.value
    elif avg_cvar < -0.10:
        dominant_risk = DominantRiskFactor.DRAWDOWN.value
    else:
        dominant_risk = DominantRiskFactor.CORRELATION.value
    
    # Calculate correlation drag (simplified - based on regime clustering)
    regime_diversity = len(set(regimes)) / max(len(regimes), 1)
    correlation_drag = max(0, 1 - regime_diversity) * 0.15  # 0-15% drag
    
    # Capital deployment based on risk regime
    if risk_regime == RiskRegime.HIGH.value:
        capital_deployment = 0.30
        position_mode = PositionScalingMode.DEFENSIVE.value
        max_new_positions = 1
        new_positions_allowed = intent_counts.get('INITIATE', 0) > 0 or intent_counts.get('ADD', 0) > 0
    elif risk_regime == RiskRegime.MODERATE.value:
        capital_deployment = 0.55
        position_mode = PositionScalingMode.SELECTIVE.value
        max_new_positions = 3
        new_positions_allowed = True
    else:
        capital_deployment = 0.75
        position_mode = PositionScalingMode.AGGRESSIVE.value
        max_new_positions = 5
        new_positions_allowed = True
    
    # Adjust for regime
    if dominant_regime in ['distribution', 'markdown', 'panic']:
        capital_deployment *= 0.7
        max_new_positions = max(1, max_new_positions - 2)
    elif dominant_regime in ['accumulation', 'markup', 'recovery']:
        capital_deployment = min(0.85, capital_deployment * 1.1)
    
    cash_hold = 1.0 - capital_deployment
    
    # Generate explanation
    initiate_count = intent_counts.get('INITIATE', 0)
    avoid_count = intent_counts.get('AVOID', 0)
    hold_count = intent_counts.get('HOLD', 0)
    
    explanation = (
        f"Market is in {dominant_regime} regime with {risk_regime} risk. "
        f"Aggregate CVaR is {avg_cvar:.1%}, volatility is {avg_volatility:.1%}. "
        f"Of {len(stock_intelligence_list)} stocks: {initiate_count} INITIATE, {hold_count} HOLD, {avoid_count} AVOID. "
        f"Recommend {capital_deployment:.0%} capital deployment with {position_mode} scaling. "
        f"Correlation drag estimated at {correlation_drag:.1%}."
    )
    
    return PortfolioIntelligence(
        risk_regime=risk_regime,
        market_regime=dominant_regime,
        capital_deployment_recommended_pct=round(capital_deployment, 2),
        cash_hold_recommended_pct=round(cash_hold, 2),
        new_positions_allowed=new_positions_allowed,
        position_scaling_mode=position_mode,
        max_new_positions_today=max_new_positions,
        dominant_risk_factor=dominant_risk,
        aggregate_cvar_95=round(avg_cvar, 4),
        aggregate_volatility=round(avg_volatility, 4),
        correlation_drag=round(correlation_drag, 4),
        portfolio_summary_explanation=explanation,
        generated_at=datetime.now().isoformat(),
        version=version,
        stocks_analyzed=len(stock_intelligence_list),
        market=market,
    )


def load_market_intelligence(market: str) -> List[Dict]:
    """Load all stock intelligence for a market."""
    market_dir = INTELLIGENCE_DIR / market
    
    if not market_dir.exists():
        logger.warning(f"Market directory not found: {market_dir}")
        return []
    
    intelligence = []
    for json_file in market_dir.glob('*.json'):
        if json_file.name.startswith('_'):
            continue  # Skip meta files
        
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
            intelligence.append(data)
        except Exception as e:
            logger.warning(f"Failed to load {json_file}: {e}")
    
    return intelligence


def save_portfolio_intelligence(portfolio_intel: PortfolioIntelligence, market: str) -> Path:
    """Save portfolio intelligence to file."""
    market_dir = INTELLIGENCE_DIR / market
    market_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = market_dir / '_portfolio_intelligence.json'
    
    with open(output_path, 'w') as f:
        json.dump(portfolio_intel.to_dict(), f, indent=2)
    
    logger.info(f"[PORTFOLIO] Saved portfolio intelligence to {output_path}")
    return output_path


def run_portfolio_intelligence(markets: List[str] = None, version: str = "v2.3-authority") -> Dict[str, PortfolioIntelligence]:
    """
    Run portfolio intelligence for all markets.
    
    This is called AFTER stock intelligence generation.
    """
    if markets is None:
        markets = ['US', 'IN']
    
    logger.info("=" * 60)
    logger.info("PORTFOLIO INTELLIGENCE LAYER")
    logger.info("=" * 60)
    
    results = {}
    
    for market in markets:
        logger.info(f"\n[PORTFOLIO] Computing intelligence for {market}...")
        
        # Load all stock intelligence
        stock_intel = load_market_intelligence(market)
        
        if not stock_intel:
            logger.warning(f"[PORTFOLIO] No stock intelligence found for {market}")
            continue
        
        logger.info(f"[PORTFOLIO] Loaded {len(stock_intel)} stocks for {market}")
        
        # Compute portfolio intelligence
        portfolio_intel = compute_portfolio_intelligence(stock_intel, market, version)
        
        # Save
        save_portfolio_intelligence(portfolio_intel, market)
        
        results[market] = portfolio_intel
        
        # Log summary
        logger.info(f"[PORTFOLIO] {market} Summary:")
        logger.info(f"  Risk Regime: {portfolio_intel.risk_regime}")
        logger.info(f"  Market Regime: {portfolio_intel.market_regime}")
        logger.info(f"  Capital Deployment: {portfolio_intel.capital_deployment_recommended_pct:.0%}")
        logger.info(f"  New Positions Allowed: {portfolio_intel.new_positions_allowed}")
        logger.info(f"  Max New Positions: {portfolio_intel.max_new_positions_today}")
        logger.info(f"  Position Mode: {portfolio_intel.position_scaling_mode}")
    
    logger.info("\n" + "=" * 60)
    logger.info("PORTFOLIO INTELLIGENCE COMPLETE")
    logger.info("=" * 60)
    
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    run_portfolio_intelligence()

