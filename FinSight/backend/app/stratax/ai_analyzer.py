"""
Groq AI-powered option chain and strategy analysis.
"""

import os
import logging
from typing import Dict, Any, List, Optional
from groq import Groq

logger = logging.getLogger(__name__)

# Initialize Groq client
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)


def analyze_option_chain(symbol: str, option_chain_data: List[Dict[str, Any]], spot_price: float) -> Dict[str, Any]:
    """
    Analyze option chain data using Groq AI.
    
    Returns comprehensive analysis including:
    - Market sentiment
    - Key support/resistance levels
    - Trading opportunities
    - Risk assessment
    """
    try:
        # Prepare data summary for AI
        calls = [r for r in option_chain_data if r.get('optionType') == 'CE']
        puts = [r for r in option_chain_data if r.get('optionType') == 'PE']
        
        total_call_oi = sum(r.get('openInterest', 0) or 0 for r in calls)
        total_put_oi = sum(r.get('openInterest', 0) or 0 for r in puts)
        pcr = total_call_oi / total_put_oi if total_put_oi > 0 else 0
        
        highest_oi_strikes = sorted(
            option_chain_data,
            key=lambda x: x.get('openInterest', 0) or 0,
            reverse=True
        )[:5]
        
        highest_iv = max(
            (r.get('impliedVolatility', 0) or 0 for r in option_chain_data),
            default=0
        )
        
        data_summary = f"""
Symbol: {symbol}
Spot Price: {spot_price}
Put/Call Ratio (PCR): {pcr:.2f}
Total Call OI: {total_call_oi:,}
Total Put OI: {total_put_oi:,}
Highest IV: {highest_iv*100:.1f}%

Top 5 Highest OI Strikes:
{chr(10).join([f"  Strike {r.get('strikePrice')}: OI={r.get('openInterest', 0):,}, IV={r.get('impliedVolatility', 0)*100 if r.get('impliedVolatility') else 0:.1f}%" for r in highest_oi_strikes])}
"""
        
        prompt = f"""You are an expert options trading analyst. Analyze the following option chain data and provide a comprehensive trading analysis.

{data_summary}

Provide analysis in the following structured format:

1. **Market Sentiment**: Bullish/Bearish/Neutral with reasoning
2. **Key Support Levels**: Based on highest PUT OI strikes
3. **Key Resistance Levels**: Based on highest CALL OI strikes
4. **Trading Opportunities**: Specific strategies (e.g., Bull Call Spread, Bear Put Spread, Iron Condor)
5. **Risk Assessment**: Overall risk level (Low/Medium/High) and key risks
6. **Recommendations**: Actionable trading recommendations
7. **Probability Analysis**: Likelihood of different price movements

Be concise, professional, and data-driven. Focus on actionable insights."""
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert options trading analyst with deep knowledge of Indian markets (NSE), option Greeks, and advanced trading strategies. Provide professional, data-driven analysis."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=2000
        )
        
        analysis_text = chat_completion.choices[0].message.content
        
        return {
            "symbol": symbol,
            "spot_price": spot_price,
            "pcr": pcr,
            "analysis": analysis_text,
            "summary": {
                "total_call_oi": total_call_oi,
                "total_put_oi": total_put_oi,
                "highest_iv": highest_iv,
            }
        }
        
    except Exception as e:
        logger.error(f"Error in AI analysis: {e}", exc_info=True)
        return {
            "symbol": symbol,
            "spot_price": spot_price,
            "error": str(e),
            "analysis": "AI analysis temporarily unavailable. Please try again later."
        }


def analyze_strategy(strategy_data: Dict[str, Any], option_chain_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze a specific options strategy using Groq AI.
    
    Args:
        strategy_data: Strategy details (legs, strikes, actions, etc.)
        option_chain_data: Current option chain data for calculations
    """
    try:
        legs_summary = []
        for leg in strategy_data.get('legs', []):
            legs_summary.append(
                f"{leg.get('action')} {leg.get('quantity')}x {leg.get('optionType')} "
                f"{leg.get('strike')} @ {leg.get('entryPrice')}"
            )
        
        strategy_summary = f"""
Strategy Type: {strategy_data.get('strategy_type', 'Custom')}
Legs:
{chr(10).join([f"  - {leg}" for leg in legs_summary])}
Net Premium: {strategy_data.get('net_premium', 0):.2f}
Max Profit: {strategy_data.get('max_profit', 'Unlimited')}
Max Loss: {strategy_data.get('max_loss', 'Unlimited')}
Breakeven Points: {', '.join(map(str, strategy_data.get('breakeven_points', [])))}
"""
        
        prompt = f"""You are an expert options strategy analyst. Analyze the following options strategy and provide comprehensive insights.

{strategy_summary}

Provide analysis covering:

1. **Strategy Overview**: What this strategy is designed to profit from
2. **Profit Potential**: When and how this strategy makes money
3. **Risk Assessment**: Key risks and when losses occur
4. **Greeks Impact**: How Delta, Gamma, Theta, Vega affect this strategy
5. **Market Conditions**: Best market conditions for this strategy
6. **Exit Strategy**: When to exit (profit targets, stop losses)
7. **Probability of Success**: Estimated probability of profitability
8. **Improvements**: How to optimize or hedge this strategy

Be specific, practical, and actionable."""
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert options strategy analyst specializing in multi-leg strategies, risk management, and probability-based trading."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=2000
        )
        
        analysis_text = chat_completion.choices[0].message.content
        
        return {
            "strategy_type": strategy_data.get('strategy_type', 'Custom'),
            "analysis": analysis_text,
            "recommendations": []
        }
        
    except Exception as e:
        logger.error(f"Error in strategy AI analysis: {e}", exc_info=True)
        return {
            "strategy_type": strategy_data.get('strategy_type', 'Custom'),
            "error": str(e),
            "analysis": "AI analysis temporarily unavailable. Please try again later."
        }

