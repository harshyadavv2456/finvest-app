#!/usr/bin/env python3
"""
================================================================================
TOP OPPORTUNITIES ENGINE - v2.3-authority
================================================================================

Ranks stocks by EDGE SCORE - a risk-adjusted opportunity metric.

EDGE SCORE FORMULA:
  EDGE = (Expected_Return_P50 / |CVaR_95|) × Conviction × Regime_Alignment_Multiplier

This creates a daily ranked list of the best risk-adjusted opportunities.

OUTPUT: public/intelligence/{market}/_top_opportunities.json

================================================================================
"""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import math

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
INTELLIGENCE_DIR = PROJECT_ROOT / 'public' / 'intelligence'


@dataclass
class OpportunityEntry:
    """A single ranked opportunity."""
    rank: int
    ticker: str
    market: str
    edge_score: float
    intent: str
    conviction: float
    expected_return_p50: float
    cvar_95: float
    regime: str
    regime_alignment: float
    risk_summary: str
    why_this_beats_alternatives: str
    
    # Position guidance
    recommended_position_pct: float
    max_position_pct: float
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def get_regime_alignment_multiplier(intent: str, regime: str) -> float:
    """
    Calculate regime alignment multiplier.
    
    Higher multiplier when intent aligns with regime:
    - INITIATE in accumulation/markup/recovery = 1.2
    - INITIATE in distribution/markdown = 0.7
    - AVOID in any regime = 0.0
    """
    if intent in ['AVOID', 'EXIT']:
        return 0.0
    
    bullish_regimes = ['accumulation', 'markup', 'recovery']
    bearish_regimes = ['distribution', 'markdown', 'panic']
    
    if intent in ['INITIATE', 'ADD']:
        if regime in bullish_regimes:
            return 1.2
        elif regime in bearish_regimes:
            return 0.7
        else:
            return 0.9
    
    if intent == 'HOLD':
        return 0.8
    
    if intent == 'REDUCE':
        return 0.5
    
    return 0.8


def calculate_edge_score(
    expected_return_p50: float,
    cvar_95: float,
    conviction: float,
    intent: str,
    regime: str,
) -> float:
    """
    Calculate EDGE SCORE.
    
    Formula:
    EDGE = (Expected_Return_P50 / |CVaR_95|) × Conviction × Regime_Alignment_Multiplier
    
    Higher = better risk-adjusted opportunity
    """
    # Avoid division by zero
    if abs(cvar_95) < 0.001:
        cvar_95 = -0.001
    
    # Base ratio: expected return vs downside risk
    return_risk_ratio = expected_return_p50 / abs(cvar_95)
    
    # Regime alignment
    regime_mult = get_regime_alignment_multiplier(intent, regime)
    
    # Final edge score
    edge = return_risk_ratio * conviction * regime_mult
    
    return edge


def generate_risk_summary(intel: Dict) -> str:
    """Generate a concise risk summary."""
    vol = intel.get('volatility_20d', 0)
    vol_regime = intel.get('volatility_regime', 'unknown')
    cvar = intel.get('cvar_95', -0.05)
    max_dd = intel.get('max_drawdown_1y', intel.get('max_drawdown_expected', 0))
    
    if isinstance(cvar, str):
        cvar_str = cvar
    else:
        cvar_str = f"{cvar:.1%}"
    
    return f"Vol: {vol:.1%} ({vol_regime}), CVaR: {cvar_str}, Max DD: {max_dd:.1%}"


def generate_why_statement(intel: Dict, edge_score: float, rank: int) -> str:
    """Generate explanation of why this opportunity ranks where it does."""
    intent = intel.get('intent', 'HOLD')
    conviction = intel.get('conviction_raw', intel.get('conviction', 0.5))
    regime = intel.get('asset_regime', 'unknown')
    
    # Get supporting signals
    supporting = intel.get('supporting_signals', [])[:3]
    supporting_str = ', '.join(supporting) if supporting else 'mixed signals'
    
    if edge_score > 1.5:
        quality = "Exceptional"
    elif edge_score > 1.0:
        quality = "Strong"
    elif edge_score > 0.5:
        quality = "Moderate"
    else:
        quality = "Marginal"
    
    return (
        f"{quality} risk-adjusted opportunity. "
        f"Intent {intent} with {conviction:.0%} conviction in {regime} regime. "
        f"Key drivers: {supporting_str}."
    )


@dataclass
class AvoidEntry:
    """A stock to avoid."""
    rank: int
    ticker: str
    market: str
    intent: str
    conviction: float
    cvar_95: float
    regime: str
    risk_summary: str
    why_avoid: str
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def compute_top_opportunities(
    stock_intelligence: List[Dict],
    market: str,
    top_n: int = 15,
    min_conviction: float = 0.3,
) -> Dict[str, Any]:
    """
    Compute and rank top opportunities AND avoid list.
    
    Returns dict with:
    - opportunities: top INITIATE/ADD stocks by edge score
    - avoid_list: top AVOID/EXIT stocks by risk
    - metadata: counts for transparency
    """
    opportunities = []
    avoids = []
    
    # Count by intent for metadata
    intent_counts = {'INITIATE': 0, 'ADD': 0, 'HOLD': 0, 'REDUCE': 0, 'EXIT': 0, 'AVOID': 0}
    
    for intel in stock_intelligence:
        ticker = intel.get('ticker', '')
        intent = intel.get('intent', 'HOLD')
        # Support both new and legacy conviction fields
        conviction = intel.get('conviction_raw', intel.get('conviction', 0))
        
        # Count intents
        if intent in intent_counts:
            intent_counts[intent] += 1
        
        # Get common metrics
        expected_return = intel.get('expected_return_20d', intel.get('return_p50', 0))
        if not expected_return:
            expected_return = intel.get('comparable_median_return', 0.02)
        
        cvar = intel.get('cvar_95', -0.05)
        if isinstance(cvar, str):
            bucket_map = {'low': -0.03, 'moderate': -0.06, 'high': -0.10, 'extreme': -0.15}
            cvar = bucket_map.get(cvar.lower(), -0.08)
        
        regime = intel.get('asset_regime', 'unknown')
        
        # Build AVOID list
        if intent in ['AVOID', 'EXIT']:
            avoids.append({
                'ticker': ticker,
                'market': market,
                'intent': intent,
                'conviction': conviction,
                'cvar_95': cvar,
                'regime': regime,
                'risk_summary': generate_risk_summary(intel),
                'risk_factors': intel.get('risk_factors', []),
            })
            continue
        
        # Build opportunities list
        if conviction < min_conviction:
            continue
        
        edge = calculate_edge_score(expected_return, cvar, conviction, intent, regime)
        
        if edge <= 0:
            continue
        
        rec_pos = intel.get('recommended_position_pct', 0.02)
        max_pos = min(rec_pos * 1.5, 0.05)
        regime_align = get_regime_alignment_multiplier(intent, regime)
        
        opportunities.append({
            'ticker': ticker,
            'market': market,
            'edge_score': edge,
            'intent': intent,
            'conviction': conviction,
            'expected_return_p50': expected_return,
            'cvar_95': cvar,
            'regime': regime,
            'regime_alignment': regime_align,
            'risk_summary': generate_risk_summary(intel),
            'why_this_beats_alternatives': '',
            'recommended_position_pct': rec_pos,
            'max_position_pct': max_pos,
        })
    
    # Sort opportunities by edge score descending
    opportunities.sort(key=lambda x: x['edge_score'], reverse=True)
    
    # Sort avoids by CVaR (worst risk first - most negative)
    avoids.sort(key=lambda x: x['cvar_95'])
    
    # Build top opportunities list
    top_opps = []
    for i, opp in enumerate(opportunities[:top_n]):
        entry = OpportunityEntry(
            rank=i + 1,
            ticker=opp['ticker'],
            market=opp['market'],
            edge_score=round(opp['edge_score'], 3),
            intent=opp['intent'],
            conviction=opp['conviction'],
            expected_return_p50=opp['expected_return_p50'],
            cvar_95=opp['cvar_95'],
            regime=opp['regime'],
            regime_alignment=opp['regime_alignment'],
            risk_summary=opp['risk_summary'],
            why_this_beats_alternatives=generate_why_statement(
                {'intent': opp['intent'], 'conviction': opp['conviction'], 
                 'asset_regime': opp['regime'], 'supporting_signals': []},
                opp['edge_score'],
                i + 1
            ),
            recommended_position_pct=opp['recommended_position_pct'],
            max_position_pct=opp['max_position_pct'],
        )
        top_opps.append(entry)
    
    # Build avoid list
    avoid_list = []
    for i, av in enumerate(avoids[:top_n]):
        risk_factors = av.get('risk_factors', [])
        why_avoid = f"High risk in {av['regime']} regime. "
        if risk_factors:
            why_avoid += f"Key risks: {', '.join(risk_factors[:3])}."
        else:
            why_avoid += f"CVaR {av['cvar_95']:.1%} indicates significant downside."
        
        entry = AvoidEntry(
            rank=i + 1,
            ticker=av['ticker'],
            market=av['market'],
            intent=av['intent'],
            conviction=av['conviction'],
            cvar_95=av['cvar_95'],
            regime=av['regime'],
            risk_summary=av['risk_summary'],
            why_avoid=why_avoid,
        )
        avoid_list.append(entry)
    
    return {
        'opportunities': top_opps,
        'avoid_list': avoid_list,
        'metadata': {
            'total_stocks': len(stock_intelligence),
            'intent_counts': intent_counts,
            'initiate_candidates': intent_counts.get('INITIATE', 0) + intent_counts.get('ADD', 0),
            'avoid_candidates': intent_counts.get('AVOID', 0) + intent_counts.get('EXIT', 0),
        }
    }


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


def save_top_opportunities(result: Dict[str, Any], market: str) -> Path:
    """Save top opportunities and avoid list to file."""
    market_dir = INTELLIGENCE_DIR / market
    market_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = market_dir / '_top_opportunities.json'
    
    opportunities = result.get('opportunities', [])
    avoid_list = result.get('avoid_list', [])
    metadata = result.get('metadata', {})
    
    output = {
        'market': market,
        'generated_at': datetime.now().isoformat(),
        'version': 'v2.3-authority',
        'total_stocks': metadata.get('total_stocks', 0),
        'initiate_candidates': metadata.get('initiate_candidates', 0),
        'avoid_candidates': metadata.get('avoid_candidates', 0),
        'intent_counts': metadata.get('intent_counts', {}),
        'total_opportunities': len(opportunities),
        'total_avoids': len(avoid_list),
        'opportunities': [opp.to_dict() for opp in opportunities],
        'avoid_list': [av.to_dict() for av in avoid_list],
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    logger.info(f"[OPPORTUNITIES] Saved {len(opportunities)} opportunities + {len(avoid_list)} avoids to {output_path}")
    return output_path


def run_top_opportunities(markets: List[str] = None, top_n: int = 15) -> Dict[str, Dict]:
    """
    Run top opportunities ranking for all markets.
    
    This is called AFTER stock intelligence generation.
    """
    if markets is None:
        markets = ['US', 'IN']
    
    logger.info("=" * 60)
    logger.info("TOP OPPORTUNITIES ENGINE")
    logger.info("=" * 60)
    
    results = {}
    
    for market in markets:
        logger.info(f"\n[OPPORTUNITIES] Ranking opportunities for {market}...")
        
        # Load all stock intelligence
        stock_intel = load_market_intelligence(market)
        
        if not stock_intel:
            logger.warning(f"[OPPORTUNITIES] No stock intelligence found for {market}")
            continue
        
        logger.info(f"[OPPORTUNITIES] Evaluating {len(stock_intel)} stocks for {market}")
        
        # Compute top opportunities and avoid list
        result = compute_top_opportunities(stock_intel, market, top_n)
        
        # Save
        save_top_opportunities(result, market)
        
        results[market] = result
        
        # Log summary
        opportunities = result.get('opportunities', [])
        avoid_list = result.get('avoid_list', [])
        metadata = result.get('metadata', {})
        
        logger.info(f"[OPPORTUNITIES] {market} Summary:")
        logger.info(f"  Total stocks: {metadata.get('total_stocks', 0)}")
        logger.info(f"  INITIATE candidates: {metadata.get('initiate_candidates', 0)}")
        logger.info(f"  AVOID candidates: {metadata.get('avoid_candidates', 0)}")
        
        logger.info(f"[OPPORTUNITIES] Top 5 INITIATE for {market}:")
        for opp in opportunities[:5]:
            logger.info(f"  #{opp.rank} {opp.ticker}: Edge={opp.edge_score:.2f}, {opp.intent}, {opp.conviction:.0%}")
        
        logger.info(f"[OPPORTUNITIES] Top 5 AVOID for {market}:")
        for av in avoid_list[:5]:
            logger.info(f"  #{av.rank} {av.ticker}: CVaR={av.cvar_95:.1%}, {av.regime}")
    
    logger.info("\n" + "=" * 60)
    logger.info("TOP OPPORTUNITIES COMPLETE")
    logger.info("=" * 60)
    
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    run_top_opportunities()

