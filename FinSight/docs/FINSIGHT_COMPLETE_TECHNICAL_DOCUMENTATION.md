# FinSight Technical Documentation
## Complete System Logic & Mathematical Framework

**Version:** v2.1-full-universe  
**Last Updated:** December 2025  
**Classification:** Technical Reference Document

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Data Sources & Inputs](#3-data-sources--inputs)
4. [Layer 1: Signal Factory](#4-layer-1-signal-factory)
5. [Layer 2: Regime Engine](#5-layer-2-regime-engine)
6. [Layer 3: Signal Efficacy](#6-layer-3-signal-efficacy)
7. [Layer 4: Probability Engine](#7-layer-4-probability-engine)
8. [Layer 5: Comparable Setups](#8-layer-5-comparable-setups)
9. [Layer 6: Decision Engine](#9-layer-6-decision-engine)
10. [Layer 7: Explanation Generator](#10-layer-7-explanation-generator)
11. [Layer 8: Meta-Backtest](#11-layer-8-meta-backtest)
12. [Layer 9: Portfolio Risk](#12-layer-9-portfolio-risk)
13. [Output Specifications](#13-output-specifications)
14. [Limitations & Disclaimers](#14-limitations--disclaimers)
15. [Glossary](#15-glossary)
16. [Appendix: Complete Formulas](#16-appendix-complete-formulas)

---

# 1. Executive Summary

## 1.1 What FinSight Is

FinSight is a **rules-based quantitative decision system** that analyzes stocks through a 9-layer pipeline to produce:

- **Regime classifications** (market phase identification)
- **Probability distributions** (not price predictions)
- **Risk metrics** (CVaR, volatility, drawdown estimates)
- **Actionable decisions** (INITIATE, HOLD, AVOID)
- **Position sizing** (risk-adjusted allocations)
- **Portfolio-level risk** (correlation-aware diversification)

## 1.2 What FinSight Is NOT

- ❌ A price predictor
- ❌ An AI/ML black box
- ❌ A guarantee of returns
- ❌ Investment advice
- ❌ A replacement for human judgment

## 1.3 Core Philosophy

> **"Given current conditions, should capital be deployed, how much, and what's the downside?"**

This is the question institutions ask. FinSight answers it systematically.

## 1.4 System Performance

| Metric | Value |
|--------|-------|
| Stocks Processed | 100 (50 US + 50 India) |
| Data per Stock | ~2,500 trading days (10 years) |
| Signals Generated | 25+ per stock |
| Pipeline Runtime | ~20 seconds |
| Output Format | JSON (per stock + portfolio) |

---

# 2. System Architecture

## 2.1 The 9-Layer Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     RAW PRICE DATA (OHLCV)                      │
│                   ~2,500 days per stock                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: SIGNAL FACTORY                                        │
│  • 25+ technical signals                                        │
│  • Momentum, volatility, RSI, MACD, moving averages             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: REGIME ENGINE                                         │
│  • Asset regime (6 states)                                      │
│  • Market regime (6 states)                                     │
│  • Relative strength                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: SIGNAL EFFICACY                                       │
│  • Information Coefficient (IC)                                 │
│  • Regime-conditional weighting                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: PROBABILITY ENGINE                                    │
│  • Return distributions (P10, P50, P90)                         │
│  • CVaR (Conditional Value at Risk)                             │
│  • Regime-conditional risk estimates                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5: COMPARABLE SETUPS                                     │
│  • Historical win rates                                         │
│  • Median returns                                               │
│  • Worst-case outcomes                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6: DECISION ENGINE                                       │
│  • Conviction calculation                                       │
│  • Intent determination (INITIATE/HOLD/AVOID)                   │
│  • Position sizing                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 7: EXPLANATION GENERATOR                                 │
│  • Human-readable rationale                                     │
│  • Decision trace                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 8: META-BACKTEST                                         │
│  • Historical decision quality                                  │
│  • Self-audit metrics                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 9: PORTFOLIO RISK                                        │
│  • Correlation matrix                                           │
│  • Effective positions                                          │
│  • Marginal Risk Contribution                                   │
│  • Diversification ratio                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        JSON OUTPUT                              │
│  • Per-stock intelligence files                                 │
│  • Portfolio snapshot                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

# 3. Data Sources & Inputs

## 3.1 Primary Data: OHLCV (Price Data)

**Source:** Yahoo Finance API  
**Format:** Daily resolution  
**History:** ~10 years per stock (~2,500 trading days)

| Column | Full Name | Description |
|--------|-----------|-------------|
| O | Open | First trade price of the day |
| H | High | Maximum price during the day |
| L | Low | Minimum price during the day |
| C | Close | Last trade price of the day |
| V | Volume | Number of shares traded |

### Why Price Data Is Sufficient

Price encodes ALL available information:
- Earnings surprises → reflected in price
- Insider knowledge → often leaks into price
- Macroeconomic news → immediately reflected
- Sentiment → expressed through buying/selling

This is the foundation of **technical analysis** and **quantitative finance**.

## 3.2 Secondary Data: Insider Transactions

**Source:** SEC filings (Form 4, 13F)  
**Usage:** Confidence modifier (NOT decision driver)

### Insider Signal Rules

| Filter | Threshold | Reason |
|--------|-----------|--------|
| Minimum Transaction Size (US) | $250,000 | Filter noise |
| Minimum Transaction Size (India) | ₹10 Lakhs | Filter noise |
| Clustering Window | 30 days | Group related transactions |
| Option Exercises | Excluded | Not informative |
| Gifts/Awards | Excluded | Not informative |

### Role-Based Weighting

| Role | Weight | Rationale |
|------|--------|-----------|
| Promoter | 1.00 | Highest skin in game |
| CEO | 0.90 | Best visibility into business |
| CFO | 0.85 | Knows financial health |
| Director | 0.80 | Board-level insight |
| Officer | 0.70 | Operational knowledge |
| 10% Owner | 0.60 | Major stakeholder |
| Other | 0.30 | Limited information value |

### Regime-Conditional Insider Effects

| Regime | Buy Effect | Sell Effect |
|--------|-----------|-------------|
| Accumulation | +0.15 | -0.05 |
| Recovery | +0.10 | -0.08 |
| Markup | +0.05 | 0.00 |
| Distribution | -0.05 | -0.10 |
| Markdown | 0.00 | 0.00 |
| Panic | 0.00 | 0.00 |

**Critical Rule:** Insider data adjusts CONFIDENCE, never creates a decision alone.

---

# 4. Layer 1: Signal Factory

## 4.1 Purpose

Convert raw price data into **normalized signals** — standardized measurements of market behavior.

## 4.2 Momentum Signals

### Definition
Momentum measures the rate of price change over a specific period.

### Formula

$$\text{Momentum}_N = \frac{P_t - P_{t-N}}{P_{t-N}}$$

Where:
- $P_t$ = Current price
- $P_{t-N}$ = Price N days ago
- Result expressed as decimal (0.05 = 5%)

### Signals Generated

| Signal Name | Period | Interpretation |
|-------------|--------|----------------|
| momentum_5d | 5 days | Very short-term trend |
| momentum_10d | 10 days | Short-term trend |
| momentum_20d | 20 days | Medium-term trend (key signal) |
| momentum_60d | 60 days | Long-term trend |

### Example Calculation

```
AAPL on December 14, 2025:
- Current price: $278.28
- Price 20 days ago: $260.15

momentum_20d = (278.28 - 260.15) / 260.15
             = 18.13 / 260.15
             = 0.0697
             = +6.97%
```

**Interpretation:** AAPL has gained 7% over the last 20 trading days.

---

## 4.3 Moving Average Signals

### Definition
Moving averages smooth price data to identify trend direction.

### Simple Moving Average (SMA) Formula

$$\text{SMA}_N = \frac{1}{N} \sum_{i=0}^{N-1} P_{t-i}$$

Where:
- $N$ = Number of periods
- $P_{t-i}$ = Price i days ago

### Signals Generated

| Signal Name | Comparison | Output |
|-------------|------------|--------|
| above_sma20 | Price vs 20-day SMA | 1 or 0 |
| above_sma50 | Price vs 50-day SMA | 1 or 0 |
| above_sma200 | Price vs 200-day SMA | 1 or 0 |
| sma20_slope | 5-day change in SMA20 | Decimal |
| sma50_slope | 5-day change in SMA50 | Decimal |

### Binary Signal Logic

```
above_sma_N = 1  if (current_price > SMA_N)
            = 0  if (current_price ≤ SMA_N)
```

### Interpretation

| Signal | Value | Meaning |
|--------|-------|---------|
| above_sma20 | 1 | Short-term bullish |
| above_sma20 | 0 | Short-term bearish |
| above_sma200 | 1 | Long-term bullish |
| above_sma200 | 0 | Long-term bearish |

---

## 4.4 Volatility Signals

### Definition
Volatility measures the magnitude of price fluctuations — a proxy for **risk**.

### Annualized Volatility Formula

$$\sigma_N = \text{StdDev}(r_1, r_2, ..., r_N) \times \sqrt{252}$$

Where:
- $r_i$ = Daily return on day i
- $\text{StdDev}$ = Standard deviation
- $\sqrt{252}$ = Annualization factor (252 trading days/year)

### Daily Return Formula

$$r_t = \frac{P_t - P_{t-1}}{P_{t-1}}$$

### Signals Generated

| Signal Name | Period | Usage |
|-------------|--------|-------|
| vol_20d | 20 days | Current volatility |
| vol_60d | 60 days | Baseline volatility |
| vol_ratio | vol_20d / vol_60d | Volatility regime change |
| vol_contained | vol_20d < 25% | Low volatility flag |
| vol_elevated | vol_20d > 35% | High volatility flag |

### Example Calculation

```
AAPL daily returns over 20 days:
+0.5%, -1.2%, +0.8%, -0.3%, +1.1%, ...

Standard deviation = 1.03% daily

vol_20d = 0.0103 × √252
        = 0.0103 × 15.87
        = 0.164
        = 16.4% annualized
```

### Volatility Regime Classification

| Annualized Volatility | Regime | Interpretation |
|----------------------|--------|----------------|
| < 15% | Low | Very calm, stable |
| 15% - 25% | Normal | Average conditions |
| 25% - 40% | Elevated | Increased uncertainty |
| > 40% | Extreme | Crisis conditions |

---

## 4.5 RSI (Relative Strength Index)

### Definition
RSI measures the speed and magnitude of recent price changes to identify overbought/oversold conditions.

### Formula

$$\text{RS} = \frac{\text{Average Gain}_{14}}{\text{Average Loss}_{14}}$$

$$\text{RSI} = 100 - \frac{100}{1 + \text{RS}}$$

Where:
- Average Gain = Mean of positive daily changes over 14 days
- Average Loss = Mean of absolute negative daily changes over 14 days

### Calculation Steps

1. Calculate daily price changes
2. Separate gains (positive) and losses (negative)
3. Calculate 14-day average of each
4. Compute RS ratio
5. Transform to 0-100 scale

### Signals Generated

| Signal Name | Condition | Interpretation |
|-------------|-----------|----------------|
| rsi_14 | Raw RSI value | Momentum indicator |
| rsi_oversold | RSI < 30 | Potentially undervalued |
| rsi_overbought | RSI > 70 | Potentially overvalued |

### Example

```
14-day period:
- Days with gains: 8 days, average gain = 1.2%
- Days with losses: 6 days, average loss = 0.8%

RS = 1.2 / 0.8 = 1.5
RSI = 100 - (100 / 2.5) = 60

Interpretation: Neutral (neither overbought nor oversold)
```

### Important Caveat

RSI alone has **weak predictive power** (IC typically 0.02-0.05). It is one input among many, NOT a standalone buy/sell signal.

---

## 4.6 MACD (Moving Average Convergence/Divergence)

### Definition
MACD measures momentum by comparing two exponential moving averages.

### Components

$$\text{MACD Line} = \text{EMA}_{12} - \text{EMA}_{26}$$

$$\text{Signal Line} = \text{EMA}_9(\text{MACD Line})$$

$$\text{Histogram} = \text{MACD Line} - \text{Signal Line}$$

Where:
- $\text{EMA}_N$ = Exponential Moving Average over N periods

### Exponential Moving Average Formula

$$\text{EMA}_t = \alpha \times P_t + (1 - \alpha) \times \text{EMA}_{t-1}$$

Where:
- $\alpha = \frac{2}{N + 1}$ (smoothing factor)

### Signals Generated

| Signal Name | Condition | Interpretation |
|-------------|-----------|----------------|
| macd | MACD line value | Momentum direction |
| macd_signal | Signal line value | Smoothed momentum |
| macd_histogram | Histogram value | Momentum strength |
| macd_bullish | MACD > Signal | 1 = bullish, 0 = bearish |

### Interpretation

- MACD crosses ABOVE signal → Momentum accelerating upward
- MACD crosses BELOW signal → Momentum decelerating
- Histogram expanding → Trend strengthening
- Histogram contracting → Trend weakening

---

## 4.7 Signal Output Summary

After Layer 1, each stock has a signal vector:

```json
{
  "momentum_5d": 0.032,
  "momentum_10d": 0.048,
  "momentum_20d": 0.070,
  "momentum_60d": 0.125,
  "above_sma20": 1,
  "above_sma50": 1,
  "above_sma200": 1,
  "sma20_slope": 0.008,
  "vol_20d": 0.164,
  "vol_60d": 0.172,
  "vol_ratio": 0.95,
  "vol_contained": 1,
  "vol_elevated": 0,
  "rsi_14": 58,
  "rsi_oversold": 0,
  "rsi_overbought": 0,
  "macd": 2.45,
  "macd_signal": 2.12,
  "macd_bullish": 1,
  "volume_ratio": 1.15,
  "volume_surge": 0,
  "trend_strength": 0.045
}
```

**Critical Point:** These signals are OBSERVATIONS, not decisions.

---

# 5. Layer 2: Regime Engine

## 5.1 Purpose

Classify the current **market phase** because the same signal means different things in different regimes.

## 5.2 The Six Regimes

### Regime Definitions

| Regime | Definition | Typical Duration |
|--------|------------|------------------|
| **Accumulation** | Smart money quietly building positions during low volatility consolidation | 30 days |
| **Markup** | Sustained uptrend with rising prices and expanding breadth | 60 days |
| **Distribution** | Smart money selling to retail; topping process with high volatility | 25 days |
| **Markdown** | Bear phase with declining prices and rising fear | 40 days |
| **Panic** | Extreme fear, capitulation, forced liquidation | 10 days |
| **Recovery** | Bottoming process, early reversal signs, transition from weakness | 20 days |

### The Market Cycle

```
    ┌──────────────┐
    │ ACCUMULATION │
    └──────┬───────┘
           │ (breakout)
           ▼
    ┌──────────────┐
    │    MARKUP    │
    └──────┬───────┘
           │ (exhaustion)
           ▼
    ┌──────────────┐
    │ DISTRIBUTION │
    └──────┬───────┘
           │ (breakdown)
           ▼
    ┌──────────────┐
    │   MARKDOWN   │
    └──────┬───────┘
           │ (capitulation)
           ▼
    ┌──────────────┐
    │    PANIC     │
    └──────┬───────┘
           │ (stabilization)
           ▼
    ┌──────────────┐
    │   RECOVERY   │
    └──────┬───────┘
           │ (back to start)
           ▼
    ┌──────────────┐
    │ ACCUMULATION │
    └──────────────┘
```

**Note:** This cycle is NOT guaranteed. Markets can skip phases or reverse.

---

## 5.3 Classification Criteria

### Input Metrics

| Metric | Formula | What It Measures |
|--------|---------|------------------|
| RET_20D | (P_today - P_20d_ago) / P_20d_ago | 20-day momentum |
| VOL_20D | StdDev(daily returns) × √252 | Current volatility |
| TREND_20 | (P_today / SMA_20) - 1 | Position vs 20-day average |

### Decision Rules

```
IF VOL_20D > 40% AND RET_20D < -10%:
    REGIME = PANIC

ELSE IF RET_20D > +8% AND VOL_20D < 25% AND TREND_20 > +2%:
    REGIME = MARKUP

ELSE IF RET_20D < -5% AND VOL_20D > 25%:
    REGIME = MARKDOWN

ELSE IF VOL_20D < 15% AND |RET_20D| < 3%:
    REGIME = ACCUMULATION

ELSE IF RET_20D > 0% AND VOL_20D > 25%:
    REGIME = DISTRIBUTION

ELSE:
    REGIME = RECOVERY (default)
```

### Summary Table

| Regime | RET_20D | VOL_20D | TREND_20 |
|--------|---------|---------|----------|
| PANIC | < -10% | > 40% | — |
| MARKUP | > +8% | < 25% | > +2% |
| MARKDOWN | < -5% | > 25% | — |
| ACCUMULATION | -3% to +3% | < 15% | — |
| DISTRIBUTION | > 0% | > 25% | — |
| RECOVERY | (default) | (default) | — |

---

## 5.4 Dual Regime Classification

We classify TWO regimes:

1. **Asset Regime:** The phase of the individual stock
2. **Market Regime:** The phase of the overall market (SPY/NIFTY)

### Relative Strength

$$\text{Relative Strength} = \text{Asset Bullish Bias} - \text{Market Bullish Bias}$$

| Regime | Bullish Bias |
|--------|--------------|
| Accumulation | 0.60 |
| Markup | 0.85 |
| Distribution | 0.30 |
| Markdown | 0.15 |
| Panic | 0.40 |
| Recovery | 0.65 |

### Divergence Classification

| Relative Strength | Divergence Type |
|------------------|-----------------|
| > +0.30 | Outperforming |
| -0.10 to +0.10 | Aligned |
| -0.30 to -0.10 | Underperforming |
| < -0.30 | Divergent |

### Why This Matters

- Asset in MARKUP + Market in PANIC = **High risk** (market may drag down)
- Asset in ACCUMULATION + Market in DISTRIBUTION = **High alpha opportunity**

---

# 6. Layer 3: Signal Efficacy

## 6.1 Purpose

Evaluate how well each signal has performed **historically in the current regime**.

## 6.2 Information Coefficient (IC)

### Definition
IC measures the correlation between a signal and forward returns.

### Formula

$$\text{IC} = \text{corr}(S_t, R_{t+H})$$

Where:
- $S_t$ = Signal value at time t
- $R_{t+H}$ = Return over horizon H (e.g., 20 days)
- $\text{corr}$ = Pearson correlation coefficient

### Interpretation

| IC Value | Quality | Interpretation |
|----------|---------|----------------|
| < 0.02 | Noise | No predictive value |
| 0.02 - 0.05 | Weak | Marginally useful |
| 0.05 - 0.10 | Good | Valuable signal |
| 0.10 - 0.20 | Excellent | Strong signal |
| > 0.20 | Suspicious | Possible overfit |

### Regime-Conditional IC

**Key insight:** Signal efficacy varies by regime.

| Signal | IC in Accumulation | IC in Distribution |
|--------|-------------------|-------------------|
| momentum_20d | 0.22 | 0.05 |
| volume_surge | 0.18 | -0.12 |
| rsi_oversold | 0.25 | 0.08 |

**Application:** Weight signals by their IC in the current regime.

---

## 6.3 Hit Rate

### Definition
Percentage of times the signal correctly predicted direction.

### Formula

$$\text{Hit Rate} = \frac{\text{Correct Predictions}}{\text{Total Predictions}}$$

### Example

```
Momentum positive appeared 200 times
Price went up in next 20 days: 120 times
Hit Rate = 120 / 200 = 60%
```

---

# 7. Layer 4: Probability Engine

## 7.1 Purpose

Generate **probability distributions** of future returns, NOT point predictions.

## 7.2 Return Distribution

### Calculation

```python
returns_20d = prices.pct_change(20).dropna()

return_p10 = returns_20d.quantile(0.10)
return_p25 = returns_20d.quantile(0.25)
return_p50 = returns_20d.quantile(0.50)  # Median
return_p75 = returns_20d.quantile(0.75)
return_p90 = returns_20d.quantile(0.90)
return_mean = returns_20d.mean()
return_std = returns_20d.std()
```

### Interpretation

| Percentile | Meaning |
|------------|---------|
| P10 | 10% of outcomes were worse than this |
| P25 | 25% of outcomes were worse than this |
| P50 | Median outcome (50th percentile) |
| P75 | 75% of outcomes were worse than this |
| P90 | 90% of outcomes were worse than this |

### Example Output

```json
{
  "return_p10": -0.085,
  "return_p25": -0.028,
  "return_p50": 0.027,
  "return_p75": 0.077,
  "return_p90": 0.115,
  "return_mean": 0.021,
  "return_std": 0.079
}
```

**Reading this:**
- 10% of the time, 20-day return was worse than -8.5%
- Median 20-day return was +2.7%
- 90% of the time, 20-day return was less than +11.5%

---

## 7.3 CVaR (Conditional Value at Risk)

### Definition
CVaR (also called Expected Shortfall) is the **average loss in the worst X% of scenarios**.

### Formula

$$\text{CVaR}_{95} = E[R \mid R \leq \text{VaR}_{95}]$$

Where:
- $\text{VaR}_{95}$ = 5th percentile of returns
- $E[\cdot]$ = Expected value (mean)

### Calculation

```python
var_95 = returns_20d.quantile(0.05)
worst_5pct = returns_20d[returns_20d <= var_95]
cvar_95 = worst_5pct.mean()
```

### Example

```
AAPL has 2,508 historical 20-day return periods
Worst 5% = worst 125 periods
Average return in those 125 periods = -15.2%

CVaR_95 = -15.2%
```

### Why CVaR > VaR

| Metric | What It Tells You |
|--------|-------------------|
| VaR | "95% of the time, you won't lose more than X" |
| CVaR | "When you DO lose more than X, here's how bad it gets" |

CVaR measures **tail risk** — the catastrophic scenarios that matter most.

---

## 7.4 Regime-Conditional CVaR

Risk varies by market conditions:

| Condition | CVaR Multiplier | Rationale |
|-----------|----------------|-----------|
| Normal | 0.8× | Calm markets, risk overestimated |
| Stress | 1.3× | Elevated uncertainty |
| Panic | 2.0× | Historical worst cases underestimate |

```python
cvar_95_normal = cvar_95 * 0.8
cvar_95_stress = cvar_95 * 1.3
cvar_95_panic = cvar_95 * 2.0
```

---

# 8. Layer 5: Comparable Setups

## 8.1 Purpose

Find **historical periods similar to today** and analyze what happened next.

## 8.2 Calculation

```python
n_comparable = len(returns_20d)
comparable_win_rate = (returns_20d > 0).mean()
comparable_median = returns_20d.median()
comparable_worst = returns_20d.min()
```

## 8.3 Output

```json
{
  "n_comparable_setups": 2508,
  "comparable_win_rate": 0.6495,
  "comparable_median_return": 0.0268,
  "comparable_worst_outcome": -0.2677
}
```

## 8.4 Interpretation

> "In 2,508 similar historical 20-day periods:
> - 65% were positive
> - Median gain was 2.7%
> - Worst case was a 26.8% loss"

---

# 9. Layer 6: Decision Engine

## 9.1 Purpose

Combine all inputs into an **actionable decision** with position sizing.

## 9.2 Conviction Calculation

### Base Formula

```
Conviction = Base + Return_Adjustment + Signal_Adjustment + Regime_Adjustment
```

### Components

| Component | Condition | Adjustment |
|-----------|-----------|------------|
| Base | Always | +30% |
| Return Skew | P50 > 2% AND P90 > |P10| | +20% |
| Return Skew | P50 < -2% | -10% |
| Signal Agreement | > 70% | +15% |
| Signal Agreement | < 30% | -15% |
| Favorable Regime | Markup, Accumulation | +10% |
| Unfavorable Regime | Markdown, Panic | -20% |
| Neutral Regime | Distribution | -10% |

### Example Calculation

```
AAPL Analysis:
- Base: 30%
- Return skew positive (P50=2.7%, P90=11.5% > |P10|=8.5%): +20%
- Signal agreement = 75%: +15%
- Regime = Recovery: +5%

Total Conviction = 30 + 20 + 15 + 5 = 70%
```

### Conviction Bounds

```python
conviction = max(0, min(1.0, conviction))  # Clip to [0%, 100%]
```

---

## 9.3 Intent Determination

### Decision Rules

| Conviction | Direction | Intent |
|------------|-----------|--------|
| ≥ 60% | Long | INITIATE |
| 50-60% | Long | HOLD |
| 40-60% | Neutral | HOLD |
| < 40% | Any | AVOID |

### Intent Definitions

| Intent | Meaning | Action |
|--------|---------|--------|
| INITIATE | Conditions favor new position | Consider entering |
| ADD | Strong continuation | Consider increasing |
| HOLD | No compelling change | Maintain current |
| REDUCE | Deteriorating conditions | Consider decreasing |
| AVOID | Poor risk/reward | Do not enter |

---

## 9.4 Position Sizing

### Formula

```python
def calculate_position_size(conviction, volatility, cvar):
    # Base: 6% maximum per position
    max_position = 0.06 * conviction
    
    # Volatility adjustment
    if volatility > 0.35:  # Extreme
        max_position *= 0.50
    elif volatility > 0.25:  # Elevated
        max_position *= 0.70
    
    # Risk budget constraint
    risk_budget = max_position * abs(cvar) / 0.15
    
    return min(max_position, risk_budget)
```

### Adjustment Table

| Volatility | Multiplier |
|------------|------------|
| < 25% | 1.00 |
| 25-35% | 0.70 |
| > 35% | 0.50 |

### Example

```
Inputs:
- Conviction: 71%
- Volatility: 16.4% (normal)
- CVaR: -15.2%

Calculation:
- max_position = 0.06 × 0.71 = 4.26%
- vol_adjustment = 1.00 (normal vol)
- risk_budget = 4.26% × 15.2% / 15% = 4.32%
- final = min(4.26%, 4.32%) = 4.26%

Output: 4.26% position, scaled in 2 tranches
```

### Scale-In Tranches

| Conviction | Tranches |
|------------|----------|
| < 60% | 3 |
| 60-80% | 2 |
| > 80% | 1 |

---

# 10. Layer 7: Explanation Generator

## 10.1 Purpose

Create **human-readable explanations** for every decision.

## 10.2 Structure

```
1. Regime Context: Current asset and market regime
2. Risk Context: CVaR and volatility assessment
3. Signal Context: Supporting vs opposing signals
4. Historical Context: Comparable setup statistics
5. Decision: Intent with conviction
```

## 10.3 Example Output

> "AAPL is in a recovery regime with the broader market also in recovery. 
> CVaR (95%) is -15.2%, meaning in the worst 5% of scenarios, losses could 
> exceed this level. Supporting signals: momentum_20d, above_sma20, vol_contained. 
> Opposing signals: macd_bearish. In 2,508 similar setups, win rate was 65%. 
> Conditions favor initiating a position with 71% conviction."

---

# 11. Layer 8: Meta-Backtest

## 11.1 Purpose

Evaluate **historical decision quality** — did our decisions work?

## 11.2 Metrics Tracked

| Metric | Question |
|--------|----------|
| INITIATE accuracy | When we said buy, did price go up? |
| AVOID accuracy | When we said avoid, did we dodge losses? |
| Regime performance | Which regimes produce best decisions? |

## 11.3 Current Status

This layer loads cached backtest data if available. Full historical tracking is a planned enhancement.

---

# 12. Layer 9: Portfolio Risk

## 12.1 Purpose

Manage **portfolio-level risk** through correlation analysis.

## 12.2 The Correlation Problem

**Scenario:** 10 tech stocks, all with INITIATE signal.

**Problem:** If tech crashes, ALL 10 crash together. "Diversified" portfolio behaves like 1 bet.

## 12.3 Correlation Matrix

### Calculation

```python
def compute_rolling_correlation(returns_dict, lookback=60):
    returns_df = pd.DataFrame(returns_dict)
    returns_df = returns_df.tail(lookback)
    corr_matrix = returns_df.corr()
    return corr_matrix
```

### Example Output

```
        AAPL    MSFT    GOOGL   NVDA
AAPL    1.00    0.75    0.68    0.72
MSFT    0.75    1.00    0.70    0.65
GOOGL   0.68    0.70    1.00    0.58
NVDA    0.72    0.65    0.58    1.00
```

**Reading:** AAPL and MSFT are 75% correlated — when one drops 10%, the other typically drops ~7.5%.

---

## 12.4 Effective Positions

### Definition
The number of **independent bets** in the portfolio, accounting for correlation.

### Formula

$$\text{Effective Positions} = \frac{1}{\sum_{i} w_i^2}$$

Where $w_i$ = weight of position i (normalized to sum to 1)

### Example

| Scenario | Weights | Effective Positions |
|----------|---------|---------------------|
| 10 equal (10% each) | 10 × 10% | 10.0 |
| 1 at 50%, 9 at 5.5% | 1 × 50% + 9 × 5.5% | ~3.6 |

### Interpretation

```
Our portfolio (Dec 14):
- Actual positions: 61
- Effective positions: 56.7

"61 positions, but behaving like 57 independent bets"
→ Good diversification
```

---

## 12.5 Marginal Risk Contribution (MRC)

### Definition
How much each position contributes to **total portfolio risk**.

### Formula

$$\text{MRC}_i = w_i \times \sum_{j} \left( w_j \times \sigma_i \times \sigma_j \times \rho_{ij} \right)$$

Where:
- $w_i, w_j$ = Position weights
- $\sigma_i, \sigma_j$ = Position volatilities
- $\rho_{ij}$ = Correlation between i and j

### Example

| Stock | Weight | Volatility | MRC |
|-------|--------|------------|-----|
| AAPL | 5% | 16% | 0.8% |
| NVDA | 4% | 33% | 1.2% |

NVDA contributes MORE risk despite smaller weight due to higher volatility.

---

## 12.6 Diversification Ratio

### Definition
How much diversification is reducing portfolio risk.

### Formula

$$\text{DR} = \frac{\sum_{i} w_i \times \sigma_i}{\sigma_{portfolio}}$$

Where:
- Numerator = Sum of individual weighted volatilities
- Denominator = Actual portfolio volatility

### Interpretation

| DR Value | Meaning |
|----------|---------|
| DR = 1 | No diversification benefit |
| DR = 2 | Risk reduced to 1/2 |
| DR = 4 | Risk reduced to 1/4 |

Our portfolio: DR = 4.05 → "Diversification reduces risk to 1/4 of single-stock risk"

---

## 12.7 Correlation Drag

### Definition
How much correlation "eats" potential diversification.

### Formula

$$\text{Correlation Drag} = 1 - \frac{1}{\text{DR}}$$

### Example

```
DR = 4.05
Correlation Drag = 1 - (1/4.05) = 0.753 = 75.3%

"Correlation consumes 75% of theoretical diversification benefit"
```

---

## 12.8 Risk Narrative (Auto-Generated)

```
"Portfolio holds 61 positions with good diversification 
(effective positions: 56.7). Correlation is moderate (15.5%), 
providing reasonable diversification. Regime exposure is 
concentrated: 51% in recovery."
```

---

# 13. Output Specifications

## 13.1 Stock Intelligence JSON

Each stock produces a JSON file with:

```json
{
  "ticker": "AAPL",
  "market": "US",
  "as_of_date": "2025-12-14",
  "version": "v2.1-full-universe",
  
  "asset_regime": "recovery",
  "asset_regime_confidence": 0.50,
  "market_regime": "recovery",
  "relative_strength": 0.0,
  "regime_divergence": "aligned",
  
  "volatility_20d": 0.164,
  "volatility_regime": "normal",
  
  "return_p10": -0.085,
  "return_p50": 0.027,
  "return_p90": 0.115,
  
  "cvar_95": -0.152,
  "cvar_95_normal": -0.122,
  "cvar_95_stress": -0.198,
  "cvar_95_panic": -0.304,
  
  "intent": "INITIATE",
  "conviction": 0.71,
  "direction": "long",
  
  "max_position_pct": 0.0426,
  "recommended_position_pct": 0.0298,
  "scale_in_tranches": 2,
  
  "supporting_signals": ["momentum_20d", "above_sma20", "vol_contained"],
  "opposing_signals": ["macd_bearish"],
  "signal_agreement": 0.75,
  
  "n_comparable_setups": 2508,
  "comparable_win_rate": 0.6495,
  "comparable_median_return": 0.0268,
  "comparable_worst_outcome": -0.2677,
  
  "upgrade_conditions": ["Asset regime shifts to markup", "Signal agreement > 70%"],
  "downgrade_conditions": ["Signal agreement < 30%", "Volatility spikes"],
  "risk_factors": ["Significant tail risk (CVaR: -15.2%)"],
  
  "explanation": "AAPL is in a recovery regime...",
  "rationale": "Open new position with 71% conviction...",
  
  "last_price": 278.28,
  "price_date": "2025-12-12",
  "data_quality": "good",
  "data_points": 2528
}
```

## 13.2 Portfolio Snapshot JSON

```json
{
  "version": "v2.1-full-universe",
  "as_of_date": "2025-12-14",
  "n_stocks_analyzed": 99,
  
  "intents": {
    "INITIATE": 16,
    "HOLD": 45,
    "AVOID": 38
  },
  
  "regimes": {
    "recovery": 51,
    "distribution": 20,
    "accumulation": 22,
    "markup": 3,
    "markdown": 2,
    "panic": 1
  },
  
  "portfolio_risk": {
    "n_active_positions": 61,
    "effective_positions": 56.7,
    "avg_pairwise_correlation": 0.155,
    "diversification_ratio": 4.05,
    "correlation_drag": 0.753,
    "largest_risk_contributor": "MA",
    "largest_risk_pct": 0.079,
    "risk_narrative": "Portfolio holds 61 positions..."
  },
  
  "top_opportunities": [...],
  "top_avoids": [...],
  
  "avg_conviction": 0.43,
  "avg_cvar": -0.156,
  "market_regime_us": "recovery",
  "market_regime_in": "accumulation"
}
```

---

# 14. Limitations & Disclaimers

## 14.1 Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Regime detection lag | 1-5 day delay | Accept as inherent |
| Historical patterns may not repeat | Past ≠ Future | Use probabilistic thinking |
| Data quality issues | Distorted signals | Manual review |
| Correlation breakdown in crises | Spike to 1 | Stress multipliers |
| No real-time execution | Slippage | End-of-day analysis only |

## 14.2 What We Do NOT Do

- ❌ Predict prices
- ❌ Guarantee returns
- ❌ Provide investment advice
- ❌ Use future data in any calculation
- ❌ Optimize for hindsight

## 14.3 Legal Disclaimer

> **This is NOT investment advice.** FinSight provides informational analysis only. 
> Past performance does not guarantee future results. All investments carry risk. 
> Users should do their own research and consult qualified professionals before 
> making investment decisions.

---

# 15. Glossary

| Term | Full Form | Definition |
|------|-----------|------------|
| CVaR | Conditional Value at Risk | Average loss in worst X% of scenarios |
| DR | Diversification Ratio | Measure of diversification benefit |
| EMA | Exponential Moving Average | Weighted average giving more weight to recent prices |
| HHI | Herfindahl-Hirschman Index | Concentration measure (sum of squared weights) |
| IC | Information Coefficient | Correlation between signal and forward returns |
| MACD | Moving Average Convergence/Divergence | Momentum indicator |
| MRC | Marginal Risk Contribution | Position's contribution to portfolio risk |
| OHLCV | Open High Low Close Volume | Standard price data format |
| RSI | Relative Strength Index | Momentum oscillator (0-100) |
| SMA | Simple Moving Average | Arithmetic mean of prices |
| VaR | Value at Risk | Maximum loss at confidence level |

---

# 16. Appendix: Complete Formulas

## A. Signal Formulas

| Signal | Formula |
|--------|---------|
| Momentum_N | $(P_t - P_{t-N}) / P_{t-N}$ |
| SMA_N | $\frac{1}{N} \sum_{i=0}^{N-1} P_{t-i}$ |
| Volatility_N | $\text{StdDev}(r_1...r_N) \times \sqrt{252}$ |
| RSI | $100 - \frac{100}{1 + \frac{\text{AvgGain}}{\text{AvgLoss}}}$ |
| MACD | $\text{EMA}_{12} - \text{EMA}_{26}$ |

## B. Risk Formulas

| Metric | Formula |
|--------|---------|
| Daily Return | $(P_t - P_{t-1}) / P_{t-1}$ |
| CVaR_95 | $E[R \mid R \leq \text{VaR}_{95}]$ |
| Portfolio Vol | $\sqrt{w^T \Sigma w}$ |
| MRC_i | $w_i \sum_j (w_j \sigma_i \sigma_j \rho_{ij})$ |
| Effective Positions | $1 / \sum_i w_i^2$ |
| Diversification Ratio | $\sum_i (w_i \sigma_i) / \sigma_p$ |

## C. Decision Formulas

| Metric | Formula |
|--------|---------|
| Conviction | Base + Return_Adj + Signal_Adj + Regime_Adj |
| Position Size | $\min(0.06 \times \text{Conv} \times \text{VolAdj}, \text{RiskBudget})$ |
| Signal Agreement | Supporting / (Supporting + Opposing) |

---

# Document Information

**Document Title:** FinSight Complete Technical Documentation  
**Version:** 2.1  
**Last Updated:** December 14, 2025  
**Author:** FinSight Development Team  
**Classification:** Technical Reference  

---

*End of Document*

