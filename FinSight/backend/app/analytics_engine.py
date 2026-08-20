"""
Advanced Analytics Engine
Technical analysis, pattern detection, and multi-factor scoring
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json

router = APIRouter(prefix="/api/analytics", tags=["Analytics Engine"])

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"


def get_market_for_ticker(ticker: str) -> str:
    """Determine market from ticker suffix"""
    if ticker.endswith(".NS") or ticker.endswith(".BO"):
        return "IN"
    elif ticker.endswith(".L"):
        return "UK"
    elif ticker.endswith(".T"):
        return "JP"
    elif ticker.endswith(".SI"):
        return "SG"
    elif ticker.endswith(".HK"):
        return "HK"
    elif ticker.endswith(".SS") or ticker.endswith(".SZ"):
        return "CN"
    elif ticker.endswith(".AX"):
        return "AU"
    return "US"


def load_price_history(ticker: str) -> Optional[pd.DataFrame]:
    """Load daily price history"""
    market = get_market_for_ticker(ticker)
    history_path = DATA_DIR / market / ticker / "history.parquet"
    
    if history_path.exists():
        return pd.read_parquet(history_path)
    return None


def load_minute_data(ticker: str) -> Optional[pd.DataFrame]:
    """Load minute-level data"""
    market = get_market_for_ticker(ticker)
    minute_path = DATA_DIR / market / ticker / "minute_1m.parquet"
    
    if minute_path.exists():
        return pd.read_parquet(minute_path)
    return None


def load_tech_indicators(ticker: str) -> Optional[pd.DataFrame]:
    """Load technical indicators"""
    market = get_market_for_ticker(ticker)
    tech_path = DATA_DIR / market / ticker / "tech_indicators.parquet"
    
    if tech_path.exists():
        return pd.read_parquet(tech_path)
    return None


def detect_patterns(df: pd.DataFrame) -> List[Dict]:
    """Detect chart patterns in price data"""
    if df is None or len(df) < 20:
        return []
    
    patterns = []
    closes = df['Close'].values if 'Close' in df.columns else df['close'].values
    highs = df['High'].values if 'High' in df.columns else df['high'].values
    lows = df['Low'].values if 'Low' in df.columns else df['low'].values
    
    # Detect Double Top
    if detect_double_top(highs[-20:]):
        patterns.append({
            "pattern": "Double Top",
            "type": "bearish",
            "confidence": 75,
            "description": "Two peaks at similar levels - potential reversal signal"
        })
    
    # Detect Double Bottom
    if detect_double_bottom(lows[-20:]):
        patterns.append({
            "pattern": "Double Bottom",
            "type": "bullish",
            "confidence": 75,
            "description": "Two troughs at similar levels - potential reversal signal"
        })
    
    # Detect Head and Shoulders
    if detect_head_shoulders(highs[-30:]):
        patterns.append({
            "pattern": "Head & Shoulders",
            "type": "bearish",
            "confidence": 80,
            "description": "Classic reversal pattern - bearish outlook"
        })
    
    # Detect Trend
    trend = detect_trend(closes[-20:])
    if trend != "sideways":
        patterns.append({
            "pattern": f"{trend.title()} Detected",
            "type": "bullish" if trend == "uptrend" else "bearish",
            "confidence": 70,
            "description": f"Price is in a clear {trend}"
        })
    
    # Support/Resistance
    support = find_support(lows[-30:])
    resistance = find_resistance(highs[-30:])
    
    if support:
        patterns.append({
            "pattern": f"Support Level: ${support:.2f}",
            "type": "neutral",
            "confidence": 65,
            "description": "Price has bounced from this level multiple times"
        })
    
    if resistance:
        patterns.append({
            "pattern": f"Resistance Level: ${resistance:.2f}",
            "type": "neutral",
            "confidence": 65,
            "description": "Price has been rejected at this level multiple times"
        })
    
    return patterns


def detect_double_top(highs: np.ndarray) -> bool:
    """Detect double top pattern"""
    if len(highs) < 10:
        return False
    
    sorted_highs = np.sort(highs)[-2:]
    if len(sorted_highs) < 2:
        return False
    
    diff = abs(sorted_highs[0] - sorted_highs[1]) / max(sorted_highs)
    
    idx1 = np.where(highs == sorted_highs[0])[0]
    idx2 = np.where(highs == sorted_highs[1])[0]
    
    if len(idx1) > 0 and len(idx2) > 0:
        if abs(idx1[0] - idx2[0]) >= 3 and diff < 0.03:
            return True
    return False


def detect_double_bottom(lows: np.ndarray) -> bool:
    """Detect double bottom pattern"""
    if len(lows) < 10:
        return False
    
    sorted_lows = np.sort(lows)[:2]
    if len(sorted_lows) < 2:
        return False
    
    diff = abs(sorted_lows[0] - sorted_lows[1]) / max(sorted_lows)
    
    idx1 = np.where(lows == sorted_lows[0])[0]
    idx2 = np.where(lows == sorted_lows[1])[0]
    
    if len(idx1) > 0 and len(idx2) > 0:
        if abs(idx1[0] - idx2[0]) >= 3 and diff < 0.03:
            return True
    return False


def detect_head_shoulders(highs: np.ndarray) -> bool:
    """Detect head and shoulders pattern"""
    if len(highs) < 15:
        return False
    
    max_idx = np.argmax(highs)
    if max_idx < 3 or max_idx > len(highs) - 3:
        return False
    
    left_shoulder = np.max(highs[:max_idx-2])
    head = highs[max_idx]
    right_shoulder = np.max(highs[max_idx+2:])
    
    if head > left_shoulder and head > right_shoulder:
        shoulder_diff = abs(left_shoulder - right_shoulder) / max(left_shoulder, right_shoulder)
        if shoulder_diff < 0.05:
            return True
    return False


def detect_trend(closes: np.ndarray) -> str:
    """Detect price trend"""
    if len(closes) < 5:
        return "sideways"
    
    change = (closes[-1] - closes[0]) / closes[0]
    
    if change > 0.05:
        return "uptrend"
    elif change < -0.05:
        return "downtrend"
    return "sideways"


def find_support(lows: np.ndarray) -> Optional[float]:
    """Find support level"""
    if len(lows) < 10:
        return None
    
    tolerance = np.min(lows) * 0.02
    clusters = []
    
    for low in lows:
        found = False
        for cluster in clusters:
            if abs(cluster['price'] - low) < tolerance:
                cluster['count'] += 1
                cluster['price'] = (cluster['price'] + low) / 2
                found = True
                break
        if not found:
            clusters.append({'price': low, 'count': 1})
    
    if clusters:
        strongest = max(clusters, key=lambda x: x['count'])
        if strongest['count'] >= 3:
            return strongest['price']
    return None


def find_resistance(highs: np.ndarray) -> Optional[float]:
    """Find resistance level"""
    if len(highs) < 10:
        return None
    
    tolerance = np.max(highs) * 0.02
    clusters = []
    
    for high in highs:
        found = False
        for cluster in clusters:
            if abs(cluster['price'] - high) < tolerance:
                cluster['count'] += 1
                cluster['price'] = (cluster['price'] + high) / 2
                found = True
                break
        if not found:
            clusters.append({'price': high, 'count': 1})
    
    if clusters:
        strongest = max(clusters, key=lambda x: x['count'])
        if strongest['count'] >= 3:
            return strongest['price']
    return None


def calculate_volume_profile(df: pd.DataFrame, num_bins: int = 20) -> List[Dict]:
    """Calculate volume profile distribution"""
    if df is None or len(df) < 10:
        return []
    
    close_col = 'Close' if 'Close' in df.columns else 'close'
    volume_col = 'Volume' if 'Volume' in df.columns else 'volume'
    high_col = 'High' if 'High' in df.columns else 'high'
    low_col = 'Low' if 'Low' in df.columns else 'low'
    
    min_price = df[low_col].min()
    max_price = df[high_col].max()
    price_range = max_price - min_price
    
    if price_range <= 0:
        return []
    
    bin_size = price_range / num_bins
    bins = []
    
    for i in range(num_bins):
        bin_low = min_price + (i * bin_size)
        bin_high = bin_low + bin_size
        bin_mid = (bin_low + bin_high) / 2
        bins.append({
            'price': bin_mid,
            'volume': 0,
            'low': bin_low,
            'high': bin_high
        })
    
    # Distribute volume
    for _, row in df.iterrows():
        row_low = row[low_col]
        row_high = row[high_col]
        row_vol = row[volume_col]
        
        for bin_data in bins:
            if row_low <= bin_data['high'] and row_high >= bin_data['low']:
                overlap = min(row_high, bin_data['high']) - max(row_low, bin_data['low'])
                row_range = row_high - row_low if row_high > row_low else 1
                vol_portion = (overlap / row_range) * row_vol
                bin_data['volume'] += vol_portion
    
    # Calculate percentages
    total_vol = sum(b['volume'] for b in bins)
    if total_vol > 0:
        for b in bins:
            b['percentage'] = (b['volume'] / total_vol) * 100
    
    return [{'price': b['price'], 'volume': int(b['volume']), 'percentage': round(b.get('percentage', 0), 2)} for b in bins]


def find_poc(volume_profile: List[Dict]) -> Optional[float]:
    """Find Point of Control - highest volume price level"""
    if not volume_profile:
        return None
    return max(volume_profile, key=lambda x: x['volume'])['price']


def find_value_area(volume_profile: List[Dict], percent: float = 0.7) -> Dict:
    """Find Value Area - price range containing X% of volume"""
    if not volume_profile:
        return {'high': 0, 'low': 0}
    
    sorted_by_vol = sorted(volume_profile, key=lambda x: x['volume'], reverse=True)
    total_vol = sum(p['volume'] for p in volume_profile)
    target_vol = total_vol * percent
    
    accumulated = 0
    value_prices = []
    
    for p in sorted_by_vol:
        accumulated += p['volume']
        value_prices.append(p['price'])
        if accumulated >= target_vol:
            break
    
    return {
        'high': max(value_prices) if value_prices else 0,
        'low': min(value_prices) if value_prices else 0
    }


def calculate_multi_factor_score(ticker: str) -> Dict:
    """
    Calculate comprehensive multi-factor score
    Combines: Technical, Fundamental, Momentum, Value
    """
    market = get_market_for_ticker(ticker)
    
    score = {
        "technical": 0,
        "fundamental": 0,
        "momentum": 0,
        "value": 0,
        "overall": 0,
        "rating": "Neutral"
    }
    
    # Load data
    history = load_price_history(ticker)
    tech = load_tech_indicators(ticker)
    
    # Load financials
    financials_path = DATA_DIR / market / ticker / "financials_full.json"
    financials = None
    if financials_path.exists():
        with open(financials_path, 'r') as f:
            financials = json.load(f)
    
    # Technical Score (0-100)
    if tech is not None and len(tech) > 0:
        latest = tech.iloc[-1]
        rsi = latest.get('rsi', 50)
        
        # RSI scoring
        if rsi < 30:
            score['technical'] += 30  # Oversold = bullish
        elif rsi > 70:
            score['technical'] -= 20  # Overbought = bearish
        else:
            score['technical'] += 10  # Neutral
        
        # MACD scoring
        macd = latest.get('macd', 0)
        macd_signal = latest.get('macd_signal', 0)
        if macd > macd_signal:
            score['technical'] += 20
        else:
            score['technical'] -= 10
        
        # SMA scoring (price above/below moving averages)
        sma20 = latest.get('sma_20', 0)
        sma50 = latest.get('sma_50', 0)
        
        if history is not None and len(history) > 0:
            close_col = 'Close' if 'Close' in history.columns else 'close'
            current_price = history[close_col].iloc[-1]
            
            if current_price > sma20:
                score['technical'] += 15
            if current_price > sma50:
                score['technical'] += 15
        
        score['technical'] = max(0, min(100, score['technical'] + 50))  # Normalize
    
    # Fundamental Score (0-100)
    if financials:
        info = financials.get('info', {})
        
        # PE ratio
        pe = info.get('trailingPE')
        if pe and pe > 0:
            if pe < 15:
                score['fundamental'] += 25
            elif pe < 25:
                score['fundamental'] += 15
            elif pe > 40:
                score['fundamental'] -= 15
        
        # Profit margins
        margins = info.get('profitMargins', 0) or 0
        if margins > 0.2:
            score['fundamental'] += 25
        elif margins > 0.1:
            score['fundamental'] += 15
        elif margins < 0:
            score['fundamental'] -= 20
        
        # Revenue growth
        rev_growth = info.get('revenueGrowth', 0) or 0
        if rev_growth > 0.2:
            score['fundamental'] += 25
        elif rev_growth > 0.1:
            score['fundamental'] += 15
        elif rev_growth < 0:
            score['fundamental'] -= 15
        
        # Analyst recommendation
        rec = info.get('recommendationMean')
        if rec:
            if rec < 2:
                score['fundamental'] += 20
            elif rec < 3:
                score['fundamental'] += 10
            elif rec > 4:
                score['fundamental'] -= 15
        
        score['fundamental'] = max(0, min(100, score['fundamental'] + 50))
    
    # Momentum Score (0-100)
    if history is not None and len(history) > 20:
        close_col = 'Close' if 'Close' in history.columns else 'close'
        closes = history[close_col].values
        
        # 1-week return
        if len(closes) >= 5:
            week_ret = (closes[-1] - closes[-5]) / closes[-5]
            score['momentum'] += week_ret * 100
        
        # 1-month return
        if len(closes) >= 20:
            month_ret = (closes[-1] - closes[-20]) / closes[-20]
            score['momentum'] += month_ret * 50
        
        score['momentum'] = max(0, min(100, score['momentum'] + 50))
    
    # Value Score (0-100)
    if financials:
        info = financials.get('info', {})
        
        # Price to Book
        pb = info.get('priceToBook')
        if pb and pb > 0:
            if pb < 1:
                score['value'] += 30
            elif pb < 3:
                score['value'] += 15
            elif pb > 10:
                score['value'] -= 15
        
        # Dividend yield
        div_yield = info.get('dividendYield', 0) or 0
        if div_yield > 0.04:
            score['value'] += 20
        elif div_yield > 0.02:
            score['value'] += 10
        
        # 52-week position
        current = info.get('currentPrice', 0)
        high_52 = info.get('fiftyTwoWeekHigh', 0)
        low_52 = info.get('fiftyTwoWeekLow', 0)
        
        if high_52 > low_52 and current > 0:
            position = (current - low_52) / (high_52 - low_52)
            if position < 0.3:
                score['value'] += 25  # Near 52-week low
            elif position > 0.9:
                score['value'] -= 15  # Near 52-week high
        
        score['value'] = max(0, min(100, score['value'] + 50))
    
    # Overall Score (weighted average)
    weights = {
        'technical': 0.25,
        'fundamental': 0.35,
        'momentum': 0.20,
        'value': 0.20
    }
    
    score['overall'] = round(
        score['technical'] * weights['technical'] +
        score['fundamental'] * weights['fundamental'] +
        score['momentum'] * weights['momentum'] +
        score['value'] * weights['value'],
        1
    )
    
    # Rating
    if score['overall'] >= 75:
        score['rating'] = "Strong Buy"
    elif score['overall'] >= 60:
        score['rating'] = "Buy"
    elif score['overall'] >= 40:
        score['rating'] = "Hold"
    elif score['overall'] >= 25:
        score['rating'] = "Sell"
    else:
        score['rating'] = "Strong Sell"
    
    return score


@router.get("/patterns/{ticker}")
async def get_chart_patterns(ticker: str, days: int = Query(default=90, le=365)):
    """Get detected chart patterns for a stock"""
    history = load_price_history(ticker)
    
    if history is None or history.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")
    
    # Filter to requested days
    if 'Date' in history.columns:
        history['Date'] = pd.to_datetime(history['Date'])
        cutoff = datetime.now() - timedelta(days=days)
        history = history[history['Date'] >= cutoff]
    
    patterns = detect_patterns(history)
    
    return {
        "ticker": ticker,
        "period_days": days,
        "patterns_found": len(patterns),
        "patterns": patterns
    }


@router.get("/volume-profile/{ticker}")
async def get_volume_profile(ticker: str, days: int = Query(default=60, le=365)):
    """Get volume profile analysis for a stock"""
    history = load_price_history(ticker)
    
    if history is None or history.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")
    
    # Filter to requested days
    if 'Date' in history.columns:
        history['Date'] = pd.to_datetime(history['Date'])
        cutoff = datetime.now() - timedelta(days=days)
        history = history[history['Date'] >= cutoff]
    
    profile = calculate_volume_profile(history)
    poc = find_poc(profile)
    value_area = find_value_area(profile)
    
    return {
        "ticker": ticker,
        "period_days": days,
        "point_of_control": round(poc, 2) if poc else None,
        "value_area_high": round(value_area['high'], 2),
        "value_area_low": round(value_area['low'], 2),
        "volume_profile": profile
    }


@router.get("/score/{ticker}")
async def get_multi_factor_score(ticker: str):
    """Get comprehensive multi-factor score for a stock"""
    score = calculate_multi_factor_score(ticker)
    
    return {
        "ticker": ticker,
        "scores": score,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/minute-analysis/{ticker}")
async def get_minute_analysis(ticker: str, minutes: int = Query(default=60, le=390)):
    """Get intraday minute-level analysis"""
    minute_data = load_minute_data(ticker)
    
    if minute_data is None or minute_data.empty:
        raise HTTPException(status_code=404, detail=f"No minute data found for {ticker}")
    
    # Get last N minutes
    recent = minute_data.tail(minutes)
    
    close_col = 'Close' if 'Close' in recent.columns else 'close'
    volume_col = 'Volume' if 'Volume' in recent.columns else 'volume'
    high_col = 'High' if 'High' in recent.columns else 'high'
    low_col = 'Low' if 'Low' in recent.columns else 'low'
    
    # Calculate intraday metrics
    vwap = (recent[close_col] * recent[volume_col]).sum() / recent[volume_col].sum()
    
    analysis = {
        "ticker": ticker,
        "minutes": minutes,
        "data_points": len(recent),
        "metrics": {
            "vwap": round(vwap, 2),
            "high": round(recent[high_col].max(), 2),
            "low": round(recent[low_col].min(), 2),
            "current": round(recent[close_col].iloc[-1], 2),
            "total_volume": int(recent[volume_col].sum()),
            "avg_volume_per_min": int(recent[volume_col].mean()),
            "price_range": round(recent[high_col].max() - recent[low_col].min(), 2),
            "price_vs_vwap": round(((recent[close_col].iloc[-1] - vwap) / vwap) * 100, 2)
        }
    }
    
    return analysis


@router.get("/screener/top-movers")
async def get_top_movers(market: str = Query(default="US"), limit: int = Query(default=20, le=50)):
    """Get top gainers and losers for a market"""
    market_dir = DATA_DIR / market
    if not market_dir.exists():
        raise HTTPException(status_code=404, detail=f"Market {market} not found")
    
    movers = []
    
    for ticker_dir in market_dir.iterdir():
        if not ticker_dir.is_dir():
            continue
        
        history_file = ticker_dir / "history.parquet"
        if not history_file.exists():
            continue
        
        try:
            df = pd.read_parquet(history_file)
            if len(df) < 2:
                continue
            
            close_col = 'Close' if 'Close' in df.columns else 'close'
            volume_col = 'Volume' if 'Volume' in df.columns else 'volume'
            
            current = df[close_col].iloc[-1]
            previous = df[close_col].iloc[-2]
            change_pct = ((current - previous) / previous) * 100
            
            movers.append({
                "ticker": ticker_dir.name,
                "price": round(current, 2),
                "change_percent": round(change_pct, 2),
                "volume": int(df[volume_col].iloc[-1])
            })
        except:
            continue
    
    # Sort by absolute change
    movers.sort(key=lambda x: x['change_percent'], reverse=True)
    
    gainers = [m for m in movers if m['change_percent'] > 0][:limit]
    losers = sorted([m for m in movers if m['change_percent'] < 0], key=lambda x: x['change_percent'])[:limit]
    
    return {
        "market": market,
        "gainers": gainers,
        "losers": losers
    }

