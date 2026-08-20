#!/usr/bin/env python3
"""
INSIDER SIGNAL V2 - PHASE 2 IMPLEMENTATION
============================================

Institutional-grade insider signal processing:
1. Cluster transactions by role, time, direction
2. Regime-conditional influence (not blind bullish)
3. Confidence modifier (NOT direction)
4. Noise filtering

Rules:
- Insider signals increase/decrease regime CONFIDENCE
- They do NOT flip decisions alone
- Noise is filtered aggressively
"""

import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from pathlib import Path
import json
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# Minimum transaction sizes to consider
MIN_TRANSACTION_USD = 250_000  # $250k for US
MIN_TRANSACTION_INR = 10_00_000  # ₹10L (1M) for India

# Insider role hierarchy (higher = more significant)
INSIDER_ROLE_WEIGHT = {
    'promoter': 1.0,
    'director': 0.8,
    'ceo': 0.9,
    'cfo': 0.85,
    'officer': 0.7,
    '10_percent_owner': 0.6,
    'other': 0.3,
}

# Regime-conditional effect multipliers
REGIME_INSIDER_EFFECT = {
    'accumulation': {
        'buy': 0.15,   # Strong positive - confirms regime
        'sell': -0.05,  # Mild negative
    },
    'recovery': {
        'buy': 0.10,   # Moderate positive
        'sell': -0.08, # Moderate negative
    },
    'markup': {
        'buy': 0.05,   # Neutral - late entry
        'sell': 0.0,   # Neutral - expected profit taking
    },
    'distribution': {
        'buy': -0.05,  # Negative - catching falling knife
        'sell': -0.10, # Exit signal - confirms distribution
    },
    'markdown': {
        'buy': 0.0,    # Ignore - too risky
        'sell': 0.0,   # Ignore - expected
    },
    'panic': {
        'buy': 0.0,    # Ignore - too volatile
        'sell': 0.0,   # Ignore - expected
    },
}

# Clustering parameters
CLUSTER_WINDOW_DAYS = 30  # Transactions within 30 days = same cluster
MIN_CLUSTER_SIZE = 2  # Minimum transactions to form a cluster


@dataclass
class InsiderCluster:
    """Represents a cluster of insider transactions."""
    ticker: str
    start_date: date
    end_date: date
    direction: str  # 'buy' or 'sell'
    
    # Aggregates
    n_transactions: int
    total_value: float
    avg_transaction: float
    
    # Role breakdown
    top_role: str
    role_weight: float
    
    # Consistency
    direction_consistency: float  # % of transactions in same direction
    
    # Calculated signal
    raw_signal: float
    regime_adjusted_signal: float


class InsiderSignalV2:
    """
    Phase 2 Insider Signal Processing.
    
    Key principles:
    1. Cluster related transactions
    2. Weight by insider role
    3. Apply regime-conditional multiplier
    4. Output CONFIDENCE adjustment, not direction
    """
    
    def __init__(
        self,
        min_usd: float = MIN_TRANSACTION_USD,
        min_inr: float = MIN_TRANSACTION_INR,
        cluster_window: int = CLUSTER_WINDOW_DAYS,
        min_cluster_size: int = MIN_CLUSTER_SIZE,
    ):
        self.min_usd = min_usd
        self.min_inr = min_inr
        self.cluster_window = cluster_window
        self.min_cluster_size = min_cluster_size
    
    def load_insider_data(self, ticker: str, market: str) -> Optional[pd.DataFrame]:
        """
        Load insider transaction data.
        
        PRIMARY PATH (US): InsiderFlow/sec_output_10y/{TICKER}_insider_10y.csv
        """
        # Primary path for US (SEC Form 4 data)
        if market == 'US':
            # Get project root (relative to this file's location)
            project_root = Path(__file__).parent.parent
            sec_path = project_root / 'InsiderFlow' / 'sec_output_10y' / f'{ticker}_insider_10y.csv'
            
            if sec_path.exists():
                try:
                    df = pd.read_csv(sec_path)
                    logger.debug(f"[INSIDER] Loaded {len(df)} transactions for {ticker} from SEC data")
                    return df
                except Exception as e:
                    logger.debug(f"[INSIDER] Could not load SEC data for {ticker}: {e}")
        
        # Fallback paths (legacy)
        paths = [
            Path(f'data/insider/{market.lower()}/{ticker}_insider.json'),
            Path(f'public/data/insider/{market.lower()}/{ticker}.json'),
            Path(f'data/insiderflow/{ticker}.json'),
        ]
        
        for path in paths:
            if path.exists():
                try:
                    with open(path) as f:
                        data = json.load(f)
                    
                    if isinstance(data, list):
                        df = pd.DataFrame(data)
                    elif isinstance(data, dict) and 'transactions' in data:
                        df = pd.DataFrame(data['transactions'])
                    else:
                        continue
                    
                    return df
                except Exception as e:
                    logger.debug(f"Could not load insider data from {path}: {e}")
        
        logger.debug(f"[INSIDER] No insider data found for {ticker}")
        return None
    
    def filter_noise(
        self,
        df: pd.DataFrame,
        market: str
    ) -> pd.DataFrame:
        """
        Filter out noise from insider transactions.
        
        Removes:
        - Transactions below minimum size
        - Option exercises
        - Stock awards/gifts
        - Single isolated trades
        """
        if df is None or df.empty:
            return pd.DataFrame()
        
        # Standardize column names
        df = df.copy()
        df.columns = df.columns.str.lower().str.replace(' ', '_')
        
        # Get value column
        value_col = None
        for col in ['value', 'transaction_value', 'amount', 'total_value']:
            if col in df.columns:
                value_col = col
                break
        
        if value_col is None:
            return pd.DataFrame()
        
        # Filter by minimum size
        min_value = self.min_inr if market == 'IN' else self.min_usd
        df = df[df[value_col].abs() >= min_value]
        
        # Filter out option exercises
        type_col = None
        for col in ['transaction_type', 'type', 'trans_type']:
            if col in df.columns:
                type_col = col
                break
        
        if type_col:
            exclude_types = ['option', 'award', 'gift', 'exercise', 'conversion']
            mask = ~df[type_col].str.lower().str.contains('|'.join(exclude_types), na=False)
            df = df[mask]
        
        return df
    
    def classify_role(self, role_str: str) -> Tuple[str, float]:
        """Classify insider role and return weight."""
        if not role_str:
            return 'other', INSIDER_ROLE_WEIGHT['other']
        
        role_lower = role_str.lower()
        
        if 'promoter' in role_lower:
            return 'promoter', INSIDER_ROLE_WEIGHT['promoter']
        elif 'director' in role_lower:
            return 'director', INSIDER_ROLE_WEIGHT['director']
        elif 'ceo' in role_lower or 'chief executive' in role_lower:
            return 'ceo', INSIDER_ROLE_WEIGHT['ceo']
        elif 'cfo' in role_lower or 'chief financial' in role_lower:
            return 'cfo', INSIDER_ROLE_WEIGHT['cfo']
        elif 'officer' in role_lower:
            return 'officer', INSIDER_ROLE_WEIGHT['officer']
        elif '10%' in role_lower or 'ten percent' in role_lower:
            return '10_percent_owner', INSIDER_ROLE_WEIGHT['10_percent_owner']
        else:
            return 'other', INSIDER_ROLE_WEIGHT['other']
    
    def cluster_transactions(
        self,
        df: pd.DataFrame,
        ticker: str
    ) -> List[InsiderCluster]:
        """
        Cluster transactions by time proximity and direction.
        """
        if df.empty:
            return []
        
        # Get date column
        date_col = None
        for col in ['date', 'transaction_date', 'filing_date']:
            if col in df.columns:
                date_col = col
                break
        
        if date_col is None:
            return []
        
        # Convert to datetime
        df = df.copy()
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col)
        
        # Get direction column
        direction_col = None
        for col in ['direction', 'transaction_type', 'type', 'action']:
            if col in df.columns:
                direction_col = col
                break
        
        # Get value column
        value_col = None
        for col in ['value', 'transaction_value', 'amount', 'total_value']:
            if col in df.columns:
                value_col = col
                break
        
        # Get role column
        role_col = None
        for col in ['role', 'insider_role', 'relationship', 'title']:
            if col in df.columns:
                role_col = col
                break
        
        # Build clusters
        clusters = []
        current_cluster = []
        
        for _, row in df.iterrows():
            tx_date = row[date_col].date() if hasattr(row[date_col], 'date') else row[date_col]
            
            # Determine direction
            if direction_col:
                direction_str = str(row[direction_col]).lower()
                if 'buy' in direction_str or 'purchase' in direction_str or 'acquisition' in direction_str:
                    direction = 'buy'
                elif 'sell' in direction_str or 'sale' in direction_str or 'disposal' in direction_str:
                    direction = 'sell'
                else:
                    direction = 'buy' if row.get(value_col, 0) > 0 else 'sell'
            else:
                direction = 'buy' if row.get(value_col, 0) > 0 else 'sell'
            
            # Check if should join current cluster
            if current_cluster:
                last_date = current_cluster[-1]['date']
                days_diff = (tx_date - last_date).days if hasattr(last_date, 'days') else abs(tx_date.toordinal() - last_date.toordinal())
                
                if days_diff <= self.cluster_window and direction == current_cluster[-1]['direction']:
                    current_cluster.append({
                        'date': tx_date,
                        'direction': direction,
                        'value': abs(row.get(value_col, 0)),
                        'role': row.get(role_col, 'other'),
                    })
                else:
                    # Finalize current cluster and start new one
                    if len(current_cluster) >= self.min_cluster_size:
                        clusters.append(self._build_cluster(ticker, current_cluster))
                    current_cluster = [{
                        'date': tx_date,
                        'direction': direction,
                        'value': abs(row.get(value_col, 0)),
                        'role': row.get(role_col, 'other'),
                    }]
            else:
                current_cluster = [{
                    'date': tx_date,
                    'direction': direction,
                    'value': abs(row.get(value_col, 0)),
                    'role': row.get(role_col, 'other'),
                }]
        
        # Finalize last cluster
        if len(current_cluster) >= self.min_cluster_size:
            clusters.append(self._build_cluster(ticker, current_cluster))
        
        return clusters
    
    def _build_cluster(self, ticker: str, transactions: List[Dict]) -> InsiderCluster:
        """Build InsiderCluster from transaction list."""
        dates = [t['date'] for t in transactions]
        values = [t['value'] for t in transactions]
        directions = [t['direction'] for t in transactions]
        roles = [t['role'] for t in transactions]
        
        # Find top role
        role_weights = [self.classify_role(r)[1] for r in roles]
        top_idx = np.argmax(role_weights)
        top_role, role_weight = self.classify_role(roles[top_idx])
        
        # Direction consistency
        dominant_direction = max(set(directions), key=directions.count)
        consistency = directions.count(dominant_direction) / len(directions)
        
        # Raw signal = sum of weighted values
        raw_signal = sum(v * w for v, w in zip(values, role_weights)) / sum(values) if sum(values) > 0 else 0
        
        return InsiderCluster(
            ticker=ticker,
            start_date=min(dates),
            end_date=max(dates),
            direction=dominant_direction,
            n_transactions=len(transactions),
            total_value=sum(values),
            avg_transaction=np.mean(values),
            top_role=top_role,
            role_weight=role_weight,
            direction_consistency=consistency,
            raw_signal=raw_signal,
            regime_adjusted_signal=0.0,  # Set later
        )
    
    def apply_regime_adjustment(
        self,
        clusters: List[InsiderCluster],
        current_regime: str,
        lookback_days: int = 90
    ) -> Tuple[float, str]:
        """
        Apply regime-conditional adjustment to insider signal.
        
        Returns:
            (confidence_adjustment, explanation)
        
        Key rules:
        - Returns CONFIDENCE MODIFIER, not direction signal
        - Range: [-0.15, +0.15]
        """
        if not clusters:
            return 0.0, "No significant insider activity"
        
        # Filter to recent clusters
        cutoff = date.today() - timedelta(days=lookback_days)
        recent = [c for c in clusters if c.end_date >= cutoff]
        
        if not recent:
            return 0.0, "No recent insider activity"
        
        # Get regime effect multipliers
        regime_effects = REGIME_INSIDER_EFFECT.get(current_regime, {
            'buy': 0.0,
            'sell': 0.0,
        })
        
        # Calculate weighted adjustment
        total_adjustment = 0.0
        total_weight = 0.0
        
        for cluster in recent:
            # Base effect from regime
            direction_effect = regime_effects.get(cluster.direction, 0.0)
            
            # Weight by role and consistency
            weight = cluster.role_weight * cluster.direction_consistency
            
            # Add time decay (more recent = more weight)
            days_ago = (date.today() - cluster.end_date).days
            time_weight = max(0, 1 - days_ago / lookback_days)
            
            cluster_adjustment = direction_effect * weight * time_weight
            total_adjustment += cluster_adjustment
            total_weight += weight * time_weight
        
        # Normalize and cap
        if total_weight > 0:
            final_adjustment = total_adjustment / total_weight
        else:
            final_adjustment = 0.0
        
        # Cap at +/- 0.15
        final_adjustment = max(-0.15, min(0.15, final_adjustment))
        
        # Build explanation
        n_buys = sum(1 for c in recent if c.direction == 'buy')
        n_sells = sum(1 for c in recent if c.direction == 'sell')
        total_buy_value = sum(c.total_value for c in recent if c.direction == 'buy')
        total_sell_value = sum(c.total_value for c in recent if c.direction == 'sell')
        
        if final_adjustment > 0.05:
            explanation = (
                f"Insider activity supports current view: {n_buys} buy clusters "
                f"(${total_buy_value/1e6:.1f}M) in {current_regime} regime."
            )
        elif final_adjustment < -0.05:
            explanation = (
                f"Insider activity raises caution: {n_sells} sell clusters "
                f"(${total_sell_value/1e6:.1f}M) in {current_regime} regime."
            )
        else:
            explanation = (
                f"Insider activity neutral: {n_buys} buys, {n_sells} sells in {current_regime} regime."
            )
        
        return round(final_adjustment, 4), explanation
    
    def compute_insider_signal(
        self,
        ticker: str,
        market: str,
        current_regime: str
    ) -> Dict[str, Any]:
        """
        Main entry point: compute insider signal for a stock.
        
        Returns dict with:
        - confidence_adjustment: float (-0.15 to +0.15)
        - explanation: str
        - n_clusters: int
        - data_quality: str
        """
        # Load data
        df = self.load_insider_data(ticker, market)
        
        if df is None or df.empty:
            return {
                'confidence_adjustment': 0.0,
                'explanation': 'No insider data available',
                'n_clusters': 0,
                'data_quality': 'none',
            }
        
        # Filter noise
        df = self.filter_noise(df, market)
        
        if df.empty:
            return {
                'confidence_adjustment': 0.0,
                'explanation': 'No significant insider transactions after filtering',
                'n_clusters': 0,
                'data_quality': 'filtered',
            }
        
        # Cluster transactions
        clusters = self.cluster_transactions(df, ticker)
        
        if not clusters:
            return {
                'confidence_adjustment': 0.0,
                'explanation': 'No insider clusters formed (isolated transactions filtered)',
                'n_clusters': 0,
                'data_quality': 'sparse',
            }
        
        # Apply regime adjustment
        adjustment, explanation = self.apply_regime_adjustment(clusters, current_regime)
        
        return {
            'confidence_adjustment': adjustment,
            'explanation': explanation,
            'n_clusters': len(clusters),
            'data_quality': 'good' if len(clusters) >= 3 else 'moderate',
            'recent_clusters': [
                {
                    'direction': c.direction,
                    'value': c.total_value,
                    'n_transactions': c.n_transactions,
                    'top_role': c.top_role,
                    'start_date': str(c.start_date),
                    'end_date': str(c.end_date),
                }
                for c in clusters[-3:]  # Last 3 clusters
            ],
        }


def get_insider_confidence_modifier(
    ticker: str,
    market: str,
    current_regime: str
) -> Tuple[float, str]:
    """
    Convenience function for pipeline integration.
    
    Returns:
        (confidence_adjustment, explanation)
    """
    engine = InsiderSignalV2()
    result = engine.compute_insider_signal(ticker, market, current_regime)
    return result['confidence_adjustment'], result['explanation']

