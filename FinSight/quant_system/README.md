# 14-Layer Institutional-Grade Market Intelligence System

**Version: v2.2-full-universe-14layer**

A regime-aware, probabilistic decision system designed for professional investment management. This system processes the FULL UNIVERSE of eligible stocks with no caps or limits.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  14-LAYER QUANTITATIVE DECISION ENGINE                     │
│                        v2.2 - FULL UNIVERSE ONLY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: SIGNAL FACTORY                                                    │
│  ├─ Price & Volatility Signals (momentum, trend, mean reversion)            │
│  ├─ Smart Money Signals (insider, institutional, FII/DII)                   │
│  ├─ Derivatives Signals (IV, OI, PCR, max pain)                            │
│  └─ Valuation Signals (DCF-implied, relative, earnings yield)              │
│                                          ▼                                  │
│  LAYER 2: REGIME ENGINE                                                     │
│  └─ HMM Classification: accumulation | markup | distribution |             │
│                         markdown | panic | recovery                        │
│                                          ▼                                  │
│  LAYER 3: SIGNAL EFFICACY                                                   │
│  └─ Walk-Forward IC Analysis by Regime                                     │
│                                          ▼                                  │
│  LAYER 4: PROBABILITY ENGINE                                                │
│  └─ Return Distributions (p10/p50/p90) + CVaR + Vol Forecasts             │
│                                          ▼                                  │
│  LAYER 5: BACKTESTING ENGINE                                                │
│  └─ Realistic Execution + Regime Attribution                               │
│                                          ▼                                  │
│  LAYER 6: DECISION ENGINE                                                   │
│  └─ Intent (INITIATE/HOLD/AVOID) + Conviction + Position Sizing            │
│     ◄── NEW LAYER MODIFIERS ──►                                            │
│                                          ▼                                  │
│  LAYER 7: LLM INTERPRETER                                                   │
│  └─ Structured Context + Citations + Analysis Templates                    │
│                                          ▼                                  │
│  LAYER 8: META-BACKTEST ENGINE                                              │
│  └─ Decision Quality Metrics + Historical Intent Accuracy                  │
│                                          ▼                                  │
│  LAYER 9: PORTFOLIO SIMULATOR                                               │
│  └─ Correlation-Aware Risk + Portfolio Optimization                        │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│  NEW INTELLIGENCE LAYERS (Feed into Layer 6 as modifiers)                   │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  LAYER 10: FUNDAMENTAL TRAJECTORY ENGINE                                    │
│  └─ Revenue/EBITDA/Margin ACCELERATION (not valuation)                     │
│     Output: {regime: improving|stable|deteriorating, confidence, drivers}  │
│                                                                              │
│  LAYER 11: INTRADAY STRUCTURE ENGINE                                        │
│  └─ VWAP Distance, Opening Range, Volume Imbalance                         │
│     Output: {bias: accumulation|distribution|neutral, confidence}          │
│                                                                              │
│  LAYER 12: NEWS REACTION ENGINE                                             │
│  └─ Abnormal Return + Volatility after news events (NO sentiment)          │
│     Output: {reaction: absorbed_negative|rejected_positive|..., modifier}  │
│                                                                              │
│  LAYER 13: INSIDER SIGNAL V2                                                │
│  └─ Clustered by Role + Size + Timing, Regime-Conditional                  │
│     Output: {confidence_modifier: -0.15 to +0.15, explanation}             │
│                                                                              │
│  LAYER 14: MARKET PARTICIPATION ENGINE (India)                              │
│  └─ FII/DII Flow Analysis, Market-Level Modifier                           │
│     Output: {combined_regime: strong_inflow|outflow|..., modifier}         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Execution Rules (NON-NEGOTIABLE)

| Rule | Description |
|------|-------------|
| **Full Universe** | ALL eligible stocks processed, no Top-50 caps |
| **Minimum 50** | Pipeline FAILS if < 50 stocks discovered per market |
| **Single Output** | `public/intelligence/` only, `public/insights/` DISABLED |
| **No Fallbacks** | Silent failures are prohibited |
| **14-Layer** | All new layers feed into Layer 6 as modifiers |

## Quick Start

```bash
# Install dependencies
pip install -r quant_system/requirements.txt

# Run FULL UNIVERSE pipeline (the ONLY supported mode)
python -m quant_system.run_full_daily_intelligence --full-universe

# Legacy modes are DISABLED and will raise RuntimeError:
# python -m quant_system.run_daily_intelligence        ❌ DISABLED
# python -m quant_system.generate_snapshots            ❌ DISABLED
# --test, --us-only, --in-only flags                   ❌ DISABLED
```

## Output Structure

```
public/
├── intelligence/           # SINGLE OUTPUT PATH
│   ├── US/
│   │   ├── AAPL.json
│   │   ├── MSFT.json
│   │   └── ... (ALL eligible US stocks)
│   └── IN/
│       ├── RELIANCE.NS.json
│       ├── TCS.NS.json
│       └── ... (ALL eligible India stocks)
└── portfolio/
    └── portfolio_snapshot.json
```

## JSON Output Schema (14-Layer)

```json
{
  "ticker": "AAPL",
  "market": "US",
  "version": "v2.2-full-universe-14layer",
  
  "// Core Layers 1-9": {},
  "intent": "INITIATE",
  "conviction": 0.72,
  "direction": "long",
  "asset_regime": "markup",
  "market_regime": "accumulation",
  
  "// Layer 10: Fundamental Trajectory": {},
  "fundamental_regime": "improving",
  "fundamental_confidence": 0.68,
  "fundamental_drivers": ["margin_expansion", "revenue_growth"],
  
  "// Layer 11: Intraday Structure": {},
  "intraday_bias": "accumulation",
  "intraday_confidence": 0.75,
  
  "// Layer 12: News Reaction": {},
  "news_reaction": "absorbed_negative",
  "news_confidence_modifier": 0.05,
  
  "// Layer 13: Insider Signal V2": {},
  "insider_confidence_modifier": 0.08,
  "insider_explanation": "Insider activity supports current view...",
  
  "// Layer 14: Market Participation (India only)": {},
  "market_participation_regime": "strong_inflow",
  "market_participation_modifier": 0.06
}
```

## Layer Details

### Original Layers (1-9)

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | SignalFactory | Generate all technical signals |
| 2 | RegimeEngine | HMM-based regime classification |
| 3 | SignalEfficacy | Walk-forward IC validation |
| 4 | ProbabilityEngine | Return distributions + CVaR |
| 5 | BacktestEngine | Realistic execution + attribution |
| 6 | DecisionEngine | Intent + conviction + sizing |
| 7 | LLMInterpreter | Structured context generation |
| 8 | MetaBacktest | Decision quality metrics |
| 9 | PortfolioSim | Correlation-aware risk |

### New Intelligence Layers (10-14)

| Layer | Component | Input | Output | Role |
|-------|-----------|-------|--------|------|
| 10 | FundamentalTrajectory | 3Y financials | regime + confidence | Conviction modifier |
| 11 | IntradayStructure | Minute OHLCV | bias + confidence | Entry quality |
| 12 | NewsReaction | Price behavior | reaction + modifier | Risk validation |
| 13 | InsiderSignalV2 | Clustered trades | modifier + explanation | Confidence adjustment |
| 14 | MarketParticipation | FII/DII flows | regime + modifier | Market confidence |

### Integration Rules

```
NEW LAYERS → Decision Engine (Layer 6)
─────────────────────────────────────
• All new layers output MODIFIERS, not signals
• No layer generates trades independently
• Modifiers are additive to base conviction
• Range: typically -0.15 to +0.15
• Layer 14 affects MARKET confidence, not stock
```

## Design Principles

### What This System DOES:
- ✅ Estimates probabilistic outcomes (distributions, not point targets)
- ✅ Classifies market regimes for conditional analysis
- ✅ Evaluates signal efficacy using walk-forward validation
- ✅ Provides interpretable, testable, auditable outputs
- ✅ Processes FULL UNIVERSE with no arbitrary caps
- ✅ Integrates orthogonal data layers (fundamental, intraday, news, insider, flows)

### What This System DOES NOT DO:
- ❌ Predict stock prices
- ❌ Output point price targets
- ❌ Use future data in backtests
- ❌ Build monolithic black-box models
- ❌ Claim certainty without evidence
- ❌ Cap universe to Top-50 or any subset
- ❌ Fall back silently on errors

## Directory Structure

```
quant_system/
├── __init__.py
├── config.py                              # Configuration parameters
├── schemas.py                             # Data schemas (dataclasses)
├── utils.py                               # Data loading utilities
├── layer1_signal_factory.py
├── layer2_regime_engine.py
├── layer3_signal_efficacy.py
├── layer4_probability_engine.py
├── layer5_backtesting_engine.py
├── layer6_decision_engine.py              # ◄── NEW LAYER MODIFIERS INTEGRATED HERE
├── layer7_llm_interpreter.py
├── layer8_meta_backtest.py
├── layer9_portfolio_risk.py
├── layer9_portfolio_simulator.py
├── insider_signal_v2.py                   # Layer 13
├── run_full_daily_intelligence.py         # Main pipeline (FULL UNIVERSE ONLY)
├── _LEGACY_DISABLED_run_daily_intelligence.py  # ❌ DISABLED
├── generate_snapshots.py                  # ❌ DISABLED
└── requirements.txt
```

## Philosophy

This system is **capital-allocation intelligence infrastructure**, not a screener.

It:
- **Thinks like a hedge fund**: Distributions, not predictions
- **Is regime-aware**: Context always matters
- **Is testable**: Walk-forward validation
- **Is interpretable**: Clear signal attribution
- **Is auditable**: Historical citations required
- **Fails loudly**: No silent fallbacks

It earns trust through testing — not prediction.

## Version History

| Version | Description |
|---------|-------------|
| v1.0 | Original 7-layer system |
| v2.0 | Added Layer 8-9 (MetaBacktest, PortfolioSim) |
| v2.1 | Full-universe mode option |
| **v2.2** | **FULL-UNIVERSE ONLY + Layers 10-14** |

---

*This is not financial advice. Past performance does not guarantee future results.*
