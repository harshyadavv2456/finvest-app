# How FinSight Works

## A Quantitative Decision System for Capital Allocation

---

## What This System Is (and Is Not)

### What It Is
FinSight is a **rules-based decision support system** that helps analyze stocks through a consistent, explainable framework. It processes historical market data to identify:

- Market regimes (accumulation, markup, distribution, markdown, recovery, panic)
- Signal alignment (momentum, volatility, technical indicators)
- Historical comparable setups
- Risk-adjusted position sizing recommendations

### What It Is NOT
- **Not a prediction engine** — We do not predict prices or future returns
- **Not an advisory service** — Outputs are informational, not recommendations
- **Not a black box** — Every decision can be traced to specific inputs
- **Not infallible** — Historical patterns do not guarantee future results

---

## Why Regimes Matter

Markets don't behave the same way all the time. A strategy that works in a trending market may fail in a ranging one.

### The Six Regimes

| Regime | Description | Typical Behavior |
|--------|-------------|------------------|
| **Accumulation** | Smart money building positions | Low volatility, range-bound, volume increases |
| **Markup** | Sustained uptrend | Higher highs, higher lows, momentum positive |
| **Distribution** | Smart money exiting | High volatility, failed breakouts, divergences |
| **Markdown** | Sustained downtrend | Lower highs, lower lows, momentum negative |
| **Recovery** | Transitioning from weakness | Volatility declining, early trend signs |
| **Panic** | Extreme fear | High volatility, sharp drops, capitulation |

### How We Detect Regimes

1. **Price structure** — Relationship of price to moving averages
2. **Momentum** — Rate of change across multiple timeframes
3. **Volatility** — Current vs historical volatility percentiles
4. **Volume patterns** — Confirmation or divergence

The system uses rule-based logic (not opaque ML models) to classify the current regime. Confidence levels indicate how clearly the regime is defined.

---

## How Signals Are Judged

Not all signals are created equal. We evaluate each signal's historical effectiveness.

### Signal Evaluation Metrics

| Metric | What It Measures |
|--------|------------------|
| **Information Coefficient (IC)** | Correlation between signal and forward returns |
| **Hit Rate** | % of times signal direction was correct |
| **Average Loss** | Mean return when signal was wrong |
| **Regime Dependency** | How signal performs in each regime |

### Signal Admission Rules

1. Signals must have sufficient historical data
2. Signals are weighted by their IC within the current regime
3. Highly correlated signals are penalized (redundancy penalty)
4. A minimum of 3 signals must agree for any action

### Current Signals Used

- Momentum (5d, 10d, 20d, 60d)
- Moving average relationships (20/50/200 SMA)
- RSI (14-day)
- MACD
- Volatility measures
- Volume patterns

---

## Why Risk Comes Before Return

The system is designed around a core principle:

> **Capital preservation enables participation. Large losses disable it.**

### Risk Metrics We Use

| Metric | What It Means |
|--------|---------------|
| **CVaR (95%)** | Expected loss in the worst 5% of scenarios |
| **20-day Volatility** | Current price fluctuation level |
| **Max Drawdown Expected** | Worst-case loss estimate |
| **Sortino Ratio** | Return per unit of downside risk |

### Position Sizing Rules

1. **Base position** = 6% maximum per stock
2. **Volatility adjustment** — High volatility → smaller position
3. **Conviction adjustment** — Lower conviction → smaller position
4. **Correlation adjustment** — High portfolio correlation → reduce sizes
5. **Regime adjustment** — Unfavorable regimes → reduce exposure

---

## How Decisions Are Made

The decision engine outputs one of five intents:

| Intent | Meaning | Typical Trigger |
|--------|---------|-----------------|
| **INITIATE** | Conditions favor opening a position | High conviction, aligned signals, favorable regime |
| **ADD** | Consider increasing position | Strong continuation signals |
| **HOLD** | Maintain current position | No compelling reason to change |
| **REDUCE** | Consider reducing position | Deteriorating signals, rising risk |
| **AVOID** | Do not enter | Poor risk/reward, misaligned signals |

### Decision Logic

```
1. Check regime (asset + market)
2. Generate signals from current data
3. Weight signals by regime-conditional efficacy
4. Calculate return distribution percentiles
5. Calculate CVaR and risk metrics
6. Compute conviction score
7. Apply position sizing rules
8. Generate explanation
```

Every decision can be traced back through this chain.

---

## How Portfolio Behavior Is Controlled

Individual stock decisions don't automatically become portfolio actions. Additional rules apply:

### Portfolio Constraints

| Rule | Purpose |
|------|---------|
| **Max 15 positions** | Prevent over-diversification |
| **Max 6% per position** | Limit single-stock risk |
| **20% cash floor** | Always maintain liquidity |
| **Regime exposure caps** | No more than 50% in any single regime |
| **Correlation throttle** | Reduce sizes when correlation is high |

### Effective Positions

High correlation between holdings reduces actual diversification. We calculate "effective positions":

```
If you hold 10 stocks with 0.7 average correlation,
your portfolio behaves like ~6 independent positions.
```

The system reports this to ensure transparency about true diversification.

---

## What Can Go Wrong

### Known Limitations

1. **Regime Detection Lag**
   - Regimes are identified using historical data
   - Transitions can be detected 1-5 days late
   - Rapid regime changes may not be captured in time

2. **Signal Efficacy Decay**
   - Historical signal performance may not persist
   - Market structure changes can invalidate patterns
   - We use rolling windows, but decay still occurs

3. **Data Quality Issues**
   - Corporate actions (splits, dividends) can distort signals
   - Missing data periods create gaps
   - Different data sources may have discrepancies

4. **Model Risk**
   - Rule-based systems can't adapt to unprecedented events
   - Black swan events fall outside historical patterns
   - Correlation structures can break during stress

### What We Do About It

- Use multiple confirmation signals (not single indicators)
- Apply conservative position sizing
- Maintain cash floor for unexpected opportunities/needs
- Report confidence levels and data quality
- Provide clear "what could invalidate this" conditions

---

## Technical Implementation

### 9-Layer Pipeline

| Layer | Function |
|-------|----------|
| 1 | **Signal Factory** — Generate 25+ technical signals |
| 2 | **Regime Engine** — Classify asset and market regime |
| 3 | **Signal Efficacy** — Load regime-conditional signal weights |
| 4 | **Probability Engine** — Generate return distributions |
| 5 | **Comparable Setups** — Find historical analogs |
| 6 | **Decision Engine** — Generate intent and sizing |
| 7 | **Explanation** — Create human-readable rationale |
| 8 | **Meta-Backtest** — Decision quality audit |
| 9 | **Portfolio** — Correlation-aware aggregation |

### Update Frequency

- **Daily**: Signal generation, regime prediction, decisions
- **Weekly**: Model retraining (if using ML), efficacy recalculation
- **Continuous**: Data quality monitoring

### Data Sources

- Price data: Yahoo Finance (OHLCV)
- Insider data: SEC filings (Form 4, 13F)
- Market benchmarks: SPY (US), NIFTY 50 (India)

---

## Glossary

| Term | Definition |
|------|------------|
| **CVaR** | Conditional Value at Risk — average loss in worst X% of scenarios |
| **IC** | Information Coefficient — correlation between signal and returns |
| **HMM** | Hidden Markov Model — statistical model for regime detection |
| **MRC** | Marginal Risk Contribution — each position's contribution to total risk |
| **Sortino** | Return divided by downside deviation |

---

## Important Disclaimers

1. **Not Investment Advice**: This system provides informational analysis only. It is not a recommendation to buy, sell, or hold any security.

2. **No Guarantees**: Past performance does not guarantee future results. Historical patterns may not repeat.

3. **Do Your Own Research**: Use this as one input among many in your decision-making process.

4. **Risk of Loss**: All investments carry risk. You can lose money following any strategy.

5. **No Liability**: The creators of this system are not liable for any losses incurred from its use.

---

*Last updated: 2025-12-14*
*Version: v2.0-full-pipeline*

