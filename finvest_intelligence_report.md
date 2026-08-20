# FinVest2 Data Intelligence Module: Complete Consolidated Master Blueprint

---

## Executive Summary & Design Philosophy

The **FinVest2 Data Intelligence Module** is an institutional-grade, multi-market quantitative decision framework. Operating under a strict **Locked Authority** protocol, the system rejects traditional binary biases ("bullish/bearish") in favor of **Position Intent** modeling:
* `INITIATE` (Establish new exposure)
* `ADD` (Increase conviction-backed exposure)
* `HOLD` (Maintain current exposure)
* `REDUCE` (Scale down risk parameters)
* `EXIT` (Liquidate active positions)
* `HEDGE` (Deploy tail offsets)
* `AVOID` (Decline asset exposure)

This document is the final, comprehensive technical blueprint detailing all data points, mathematical equations, analytical layers, execution processes, and operational scripts in the repository.

---

## SECTION 1: Master Schema of All Ingested Data Points

The system processes multi-source financial and non-structural datasets, mapped across distinct markets.

```
                  ┌──────────────────────────────────────────────┐
                  │          INGESTION & DATA VALIDATION         │
                  └──────────────────────┬───────────────────────┘
                                         ▼
   ┌─────────────────────────────────────┼─────────────────────────────────────┐
   ▼                                     ▼                                     ▼
[Market Feeds (OHLCV)]        [Smart Money Flow (FII/DII)]         [Alternative Data Feeds]
- Daily history.parquet       - fii_dii_cash_signals.csv           - sec_output_10y (Insider)
- Minute minute_1m.parquet    - fii_dii_daily_outlook.csv          - news.parquet (Sentiment)
- tech_indicators.parquet                                          - financials_full.json
```

### 1.1 Market price and Volume Profiles

#### 1. Daily OHLCV Data (`data/{market}/{ticker}/history.parquet`)
* **`Date`** *(Timestamp/String)*: The primary timeline index.
* **`Open`** *(Float)*: Market opening price.
* **`High`** *(Float)*: Daily maximum transaction price.
* **`Low`** *(Float)*: Daily minimum transaction price.
* **`Close`** *(Float)*: Daily market settlement price.
* **`Volume`** *(Float/Int)*: Aggregate share volume transacted.
* **`Adj Close`** *(Float)*: Splits-and-dividends adjusted close price (used for returns calculations).

#### 2. Intraday 1-Minute OHLCV Data (`data/{market}/{ticker}/minute_1m.parquet`)
* **`Timestamp`** *(Datetime)*: 1-minute interval marker.
* **`Open`, `High`, `Low`, `Close`, `Volume`** *(Float/Int)*: High-frequency interval metrics (used to construct Layer 11 intraday institutional volume blocks).

#### 3. Precomputed Technical Indicators (`data/{market}/{ticker}/tech_indicators.parquet`)
* Optional pre-calculated arrays containing historical standard indicator series (RSI, moving averages, standard deviation, MACD).

---

### 1.2 Institutional and Smart Money Flows

#### 1. Indian Stock Exchange (NSE) FII/DII Cash History (`Smart Money Flow/fii_dii_output/fii_dii_cash_signals.csv`)
* **`trade_date`** *(Date)*: The NSE session execution date.
* **`category`** *(String)*: Entity categorization (`FII` or `DII`).
* **`buyValue`** *(Float)*: Gross buy volume in INR Crores (10 Million Rupees).
* **`sellValue`** *(Float)*: Gross sell volume in INR Crores.
* **`netValue`** *(Float)*: Net capital flow ($\text{buyValue} - \text{sellValue}$).
* **`netValue_change`** *(Float)*: Daily change in net flow relative to the prior session.
* **`netValue_roll5`** *(Float)*: 5-session rolling aggregate net flow.
* **`netValue_roll20`** *(Float)*: 20-session rolling aggregate net flow.

#### 2. NSE Combined Outlook Database (`Smart Money Flow/fii_dii_output/fii_dii_daily_outlook.csv`)
* **`trade_date`** *(Date)*: Session date.
* **`fii_net`** / **`dii_net`** *(Float)*: Summed net cash contributions.
* **`total_net`** *(Float)*: Joint net flow ($\text{fii\_net} + \text{dii\_net}$).
* **`fii_roll5`** / **`dii_roll5`** / **`total_roll5`** *(Float)*: 5-session rolling totals.
* **`fii_roll20`** / **`dii_roll20`** / **`total_roll20`** *(Float)*: 20-session rolling totals.
* **`regime`** *(String)*: Market interaction quadrant classification:
  * `both_buying`: Joint institutional support.
  * `both_selling`: Broader capital exit.
  * `fii_buy_dii_sell`: FII accumulation, domestic profit-taking.
  * `fii_sell_dii_buy`: Domestic bid support, FII selling.
* **`flow_signal`** *(String)*: Systemic regime indicator (`bullish_flow`, `bearish_flow`, `conflict_flow`, `neutral_flow`).

---

### 1.3 Alternative and Macro Datasets

#### 1. Clustered SEC Form 4 Insider Database (`InsiderFlow/sec_output_10y/{ticker}_insider_10y.csv`)
* **`transactionDate`** *(Date)*: Executed transaction date.
* **`filingDate`** *(Date)*: SEC system filing submission date.
* **`reportingOwnerName`** *(String)*: Name of the corporate insider.
* **`relationship` / `role`** *(String)*: Corporate title classification (`promoter`, `director`, `ceo`, `cfo`, `officer`, `10_percent_owner`, `other`).
* **`transactionCode`** *(String)*: SEC transaction code (open-market buys `P` or open-market sells `S`).
* **`transactionShares`** *(Float)*: Size of transaction.
* **`transactionPricePerShare`** *(Float)*: Transaction execution price.
* **`total_value`** *(Float)*: Total transaction size ($\text{Shares} \times \text{Price}$).

#### 2. Sector Rotation Index (`StrataX` Integration Store)
* Weekly historical and momentum matrices tracking capital rotation across sectors (Tech, Finance, Energy, Consumer Discretionary) to adjust sector-weight limits.

#### 3. Macro Precious Metals Database
* Real-time and historical spot data for Gold and Silver, defining broader market risk regimes (`RISK_ON`, `TRANSITION`, `RISK_OFF`).

#### 4. Corporate Press and Sentiment (`data/{market}/{ticker}/news.parquet`)
* **`timestamp`** *(Date/Time)*: News release time.
* **`sentiment_score`** *(Float)*: Sentiment score ranging from $-1.0$ (strongly negative) to $+1.0$ (strongly positive).
* **`confidence`** *(Float)*: Classification model confidence ($0.0$ to $1.0$).
* **`news_detected`** *(Boolean)*: System alert flag for unexpected major corporate events.

#### 5. Financial Statements (`data/{market}/{ticker}/financials_full.json`)
* 3-year historical Balance Sheet, Income Statement, and Cash Flow statement entries used to calculate fundamental health modifiers.

---

## SECTION 2: Master Core Quantitative layers (Layers 1-14)

```
       ┌────────────────────────────────────────────────────────┐
       │             LAYER 1: Raw Signal Ingestion              │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             LAYER 2: Regime Classification             │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             LAYER 3: Walk-Forward Efficacy             │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             LAYER 4: Probability & Vol Risk            │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │            LAYER 5: Comparable Setup Finder            │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │        LAYER 6: Institutional Position Intent          │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │       LAYERS 10-14: Modular Modifiers (Fundamental,    │
       │       Intraday, News, Insider, FII/DII Inflows)        │
       └───────────────────────────┬────────────────────────────┘
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │           LAYER 7: LLM Compliance Narratives           │
       └────────────────────────────────────────────────────────┘
```

### Layer 1: Signal Ingestion Factory
Standardizes raw price action and volume profiles into mathematical ratios:
* **Multi-Horizon Momentum Velocities**: Calculates returns over $5d, 10d, 20d,$ and $60d$ horizons to capture price acceleration:
  $$\text{Momentum}_{N} = \frac{\text{Close}_t}{\text{Close}_{t-N}} - 1.0$$
* **Moving Average Slopes**: Measures the slope of the 20-day and 50-day simple moving averages over a 5-day window:
  $$\text{Slope}_{\text{MA}} = \frac{\text{MA}_t - \text{MA}_{t-5}}{\text{MA}_{t-5}}$$
* **Volatility Profiling**: Annualizes standard deviation over 20-day and 60-day windows:
  $$\text{vol\_20d} = \text{Std}(\text{Returns}_{20d}) \times \sqrt{252}$$
* **Distribution Skew Metrics**:
  * **RSI (14-day)**: Computes relative strength velocity boundaries.
  * **MACD**: Measures difference between 12-day and 26-day EMAs relative to a 9-day signal line.

---

### Layer 2: Regime Classification Engine
Applies a mathematical Hidden Markov Model (HMM) to classify market and asset regimes.
* **Transition Probability Matrices**: Evaluates historical state persistence ($P_{i,j} = P(S_t = j \mid S_{t-1} = i)$) to project state decay or state persistence.
* **Relative Regime Strength ("Gold Signal")**:
  Computes asset alpha relative to the benchmark index ($S\&P 500$ for US, $Nifty 50$ for IN):
  $$\text{Relative Strength} = \text{RegimeConfidence}_{\text{Asset}} - \text{RegimeConfidence}_{\text{Benchmark}}$$
  This categorizes setups into aligned momentum (both in markup) or divergence (asset in markup, market in markdown).

---

### Layer 2B: Precious Metals (Macro Context)
Provides an independent macro safeguard layer assessing commodity indexes (Gold/Silver). It identifies systematic shifts between macro risk environments and dynamically adjusts trading thresholds:
* **Risk-Off**: Increases the conviction threshold required to initiate new long positions by $15\%$, while increasing the urgency parameter to exit underperforming long positions.
* **Risk-On**: Re-normalizes the baseline execution thresholds.

---

### Layer 3: Signal Efficacy Walk-Forward Validation
Enforces strict signal independence to prevent the "correlated signal illusion" (where multiple signals derived from the same source artificially inflate conviction).
* **Correlation-Penalized Weights**: Measures spearman-rank pairwise correlations ($C$) and mutual information ($MI$) to identify redundancy.
  $$\text{Effective Weight}_i = \text{Raw Weight}_i \times \prod_{j \neq i} (1 - |C_{i,j}|)$$
* **Signal Floor Enforcement**: Under sparse data, the system ensures that at least 5 independent, non-overlapping signals are active. If signal filters return fewer, the engine dynamically selects the most regime-appropriate fallback signals, marking them as `low-confidence` to ensure continuity.

---

### Layer 4: Probability Engine
Rejects static assumption models, analyzing tail distributions through regime-conditioned risk metrics:
* **Conditional Volatility Modeling**: Tracks separate volatility targets conditional on the regime state:
  $$\text{Volatility Forecast} = w_1 \cdot \text{Vol}_{\text{Current}} + w_2 \cdot \text{Vol}_{\text{Regime}}$$
  Where $\text{Vol}_{\text{Regime}}$ transitions dynamically from normal ($18\%$) to stress ($32\%$) and tail/panic ($55\%$).
* **Regime-Conditioned CVaR (Conditional Value at Risk)**: Computes expected downside losses specifically tailored to the current environment, offering risk metrics that align with portfolio management requirements:
  $$\text{CVaR}_{95\%} = E[R \mid R \le \text{VaR}_{95\%}]$$

---

### Layer 5: Comparable Setup Discovery
Performs historical backtests using a non-parametric pattern-matching search. It queries historical periods that match the current HMM regime, relative strength band, and volatility profile. The engine outputs:
* Expected win-rate percentage.
* Median return trajectory over the target horizon.
* Historical maximum drawdown and failure attribution profiles.

---

### Layer 6: Institutional Decision Engine
Converts the quantitative signals into high-conviction position instructions.
* **Continuous Conviction Calculations**: The system uses continuous, high-precision conviction metrics to maximize signal resolution, preventing information loss from early rounding or discretization.
* **Position Intent Mapping**: Dynamically maps conviction levels, signal agreements, and direction indexes into actionable portfolio instructions:
```
[Conviction Score] ───► [>= 0.60 & Long]  ───► INITIATE (New Position)
                   ───► [0.50 - 0.59]     ───► HOLD (Maintain Exposure)
                   ───► [< 0.40]          ───► AVOID / EXIT / REDUCE
```
* **Risk-Budgeted Position Sizing**: Recommended exposure size is calculated as a function of the portfolio’s maximum risk tolerance and the asset's active CVaR:
  $$\text{Position Size} = \min \left( 0.06 \cdot \text{Conviction}, \frac{\text{Risk Budget}}{\text{CVaR}_{95\%}} \right)$$

---

### Layer 7: LLM Compliance Narrative Layer
Translates complex data structures into institutional investment memos while enforcing rigorous compliance guidelines.
* **Forbidden Language Filtration**: An active parser screens output drafts, automatically replacing un-compliant vocabulary with proper probabilistic alternatives:
  * *Red flagged*: "Stock will go up", "Price target", "Guaranteed", "Can't lose".
  * *Compliant*: "Shows positive probability skew", "p90 scenario outcome", "historically has shown".
* **Language Confidence Throttling**: If signal agreement is low, if volatility enters the extreme regime, or if the asset shifts to a panic state, the narrative generator automatically downgrades the tone from `confident` to `conservative` or `cautionary`, appending explicit risk disclosures.

---

### Layer 8: Meta-Backtest Engine
Evaluates the quality of historical system decisions.
* **Decision Quality vs. Trade Returns**: Rather than testing trade entries, this engine audits historical decision accuracy:
  * **AVOID Correctness**: Evaluates if assets flagged as `AVOID` subsequently fell or experienced significant drawdowns ($>-5\%$).
  * **INITIATE Correctness**: Verifies if assets flagged as `INITIATE` achieved positive expectancy over a 20-day horizon.
* **Capital Protection Ratio**:
  $$\text{Avoid Effectiveness} = \frac{\text{AVOIDs preventing loss / drawdown}}{\text{Total AVOIDs}}$$
  This metrics feeds directly into LLM compliance disclosures.

---

### Layer 9: Portfolio Risk & Simulation
Computes correlation-aware risk metrics across active assets.
* **Marginal Risk Contribution (MRC)**:
  Measures the risk added by each position:
  $$\text{MRC}_i = w_i \times \sum_{j} (w_j \cdot \sigma_i \cdot \sigma_j \cdot \rho_{i,j})$$
  Where $\rho_{i,j}$ represents rolling correlation.
* **Effective Position Count (HHI Inverse)**:
  $$\text{Effective Positions} = \frac{1}{\sum (w_i^2)}$$
  If a portfolio contains 10 assets but is highly concentrated in one, the effective position count drops, signaling concentration risk.
* **Diversification Ratio**:
  $$\text{Diversification Ratio} = \frac{\sum (w_i \cdot \sigma_i)}{\sigma_{\text{Portfolio}}}$$
* **Correlation Drag Caps**: If the rolling pairwise correlation of the portfolio exceeds $0.65$, or if the effective position ratio falls below $60\%$, all position sizes are scaled down by up to $50\%$ to protect capital.

---

### Layers 10-14: Dynamic Structural Modifiers
* **Layer 10 (Fundamental Trajectory)**: Analyzes financial statements. Improving fundamental regimes add $+0.10$ to the base conviction, while deteriorating regimes reduce it by $-0.12$.
* **Layer 11 (Intraday Structure)**: Processes high-frequency order books to detect institutional accumulation or distribution blocks, applying directional conviction adjustments.
* **Layer 12 (News Reaction)**: Analyzes stock resilience to news events. If bad news is digested without abnormal sell-offs, the engine recognizes positive absorption and adjusts the conviction modifier accordingly.
* **Layer 13 (Insider Signal V2)**: Clustered SEC filings are processed using role-weight hierarchies (e.g., Promoter $= 1.0$, CFO $= 0.85$, $10\%$ owner $= 0.60$). Transactions below configured capital thresholds are filtered out as noise. Validated insider clusters yield confidence adjustments of up to $\pm 0.15$.
* **Layer 14 (Market Participation)**: Aggregates FII and DII net cash flows. Broad institutional buying boosts market regime confidence ($+0.08$), whereas persistent selling shifts thresholds defensively.

---

## SECTION 3: Deep Technical Analysis of All Code Modules

A complete list of files inside the `quant_system` directory, along with a detailed explanation of their code structures and logic.

```
E:\FinVest2\FinSight\quant_system\
├── run_full_daily_intelligence.py   ◄── Pipeline Core Orchestrator
├── layer1_signal_factory.py          ◄── Ingests price data, produces raw momentum/SMA features
├── layer2_regime_engine.py           ◄── HMM classification (accumulation, markup, etc.)
├── layer2b_pm_regime_engine.py       ◄── Gold/Silver indices macro context adjustments
├── layer3_signal_efficacy.py         ◄── Dynamic weight adjustment via correlation penalties
├── layer4_probability_engine.py      ◄── Regime-conditioned volatility and CVaR calculations
├── layer5_backtesting_engine.py      ◄── Comparative backtests and failure analyses
├── layer6_decision_engine.py         ◄── Sizing rules and position intent mapping
├── layer7_llm_interpreter.py         ◄── Institutional-grade investment memo generator
├── layer8_meta_backtest.py           ◄── Audits past recommendations (capital protection metric)
├── layer9_portfolio_risk.py          ◄── Marginal Risk Contribution (MRC) and dynamic caps
├── data_validator.py                 ◄── Validation and coverage checks for OHLCV parquet files
└── pipeline_audit.py                 ◄── Schema validation and sanity checks
```

---

### 3.1 Pipeline Core Orchestrator: `run_full_daily_intelligence.py`
This module acts as the central execution hub for the 14-layer decision system.
* **Pipeline Initialization**: Initializes logging and imports data handlers, mathematical libraries (`numpy`, `pandas`, `scipy`), and Layer 1-9 engines.
* **Execution Flow**:
  1. Calls `data_validator.py` to establish the active universe of valid assets.
  2. Spawns a multi-threaded execution pool to process each asset.
  3. Skips designated data source assets (e.g., PM index tickers) to focus on target recommendations.
  4. Runs Layer 1 signals and Layer 2 regime models for each active asset.
  5. Computes probabilistic volatility forecasts and tail-risk values (Layer 4).
  6. Applies modifiers from alternative datasets: fundamental momentum (Layer 10), intraday blocks (Layer 11), news sentiment analysis (Layer 12), insider trade clusters (Layer 13), and institutional cash flows (Layer 14).
  7. Evaluates baseline conviction and maps the active position intent (Layer 6).
  8. Passes the completed analytical metrics to the compliance narrative layer to generate vetted investment memos (Layer 7).
  9. Validates all outputs against `STOCK_INTELLIGENCE_SCHEMA` and serializes the results as JSON files.

---

### 3.2 Ingests price data: `layer1_signal_factory.py`
This module translates raw OHLCV prices into standardized, regime-aware technical and momentum features.
* **Key Functions**:
  * `generate_momentum_signals(prices_df)`: Calculates returns across $5d, 10d, 20d,$ and $60d$ horizons to capture price acceleration.
  * `generate_moving_averages(prices_df)`: Calculates simple and exponential moving averages ($20, 50, 200$) and measures MA slopes.
  * `generate_volatility_features(prices_df)`: Annulizes standard deviations and tracks volatility regimes.
  * `generate_range_indicators(prices_df)`: Computes RSI-14 levels, MACD signal histograms, and Average True Range (ATR) metrics.

---

### 3.3 HMM classification: `layer2_regime_engine.py`
Implements a Hidden Markov Model (HMM) using `hmmlearn` to classify market and asset regimes.
* **Key Functions**:
  * `fit_hmm_model(returns_series, n_components=6)`: Trains a multi-state Gaussian HMM on historical log-return streams.
  * `predict_active_regime(returns_series)`: Computes the posterior probabilities for each regime state.
  * `compute_relative_regime_strength(asset_state, index_state)`: Calculates the "Gold Signal" relative strength index.
  * `track_state_duration(regime_history)`: Counts consecutive days in the active regime to flag potential state decay.

---

### 3.4 Gold/Silver indices macro context adjustments: `layer2b_pm_regime_engine.py`
Incorporates macro gold/silver precious metal flows as risk sensors.
* **Key Functions**:
  * `analyze_pm_flows(gold_df, silver_df)`: Analyzes momentum and volume spikes in spot metals.
  * `classify_macro_risk()`: Categorizes the macro environment into `RISK_ON`, `TRANSITION`, or `RISK_OFF`.
  * `get_execution_modifiers()`: Adjusts position-initiate and exit thresholds dynamically.

---

### 3.5 Dynamic weight adjustment: `layer3_signal_efficacy.py`
Enforces Walk-Forward Optimization (WFO) and signal correlation penalties.
* **Key Functions**:
  * `compute_pairwise_correlation(signals_df)`: Computes Pearson and Spearman rank correlation matrices across active signals.
  * `apply_correlation_penalties(weights, correlation_matrix)`: Calculates correlation penalties to adjust signal weights.
  * `verify_minimum_signals()`: Ensures the active signal count meets the system's threshold, triggering low-data fallbacks if necessary.

---

### 3.6 Volatility and CVaR calculations: `layer4_probability_engine.py`
Calculates non-parametric risk projections tailored to the active regime.
* **Key Functions**:
  * `forecast_conditional_volatility(current_vol, active_regime)`: Adjusts future volatility projections based on HMM state.
  * `compute_cvar_95(returns_distribution)`: Integrates log returns to calculate the Expected Shortfall (CVaR).
  * `calculate_extreme_drawdown(cvar)`: Projects potential maximum drawdowns during stressed market states.

---

### 3.7 Comparative backtests: `layer5_backtesting_engine.py`
Runs historical simulation queries on matching regimes.
* **Key Functions**:
  * `query_matching_periods(regime, volatility_band)`: Locates historical regimes matching the current profile.
  * `calculate_historical_performance()`: Compiles historical win rates, median paths, and drawdown profiles.
  * `generate_failure_attribution()`: Categorizes past failure drivers for current review.

---

### 3.8 Sizing rules and position intent: `layer6_decision_engine.py`
Converts signals and risk inputs into specific position sizing instructions.
* **Key Functions**:
  * `calculate_continuous_conviction(signals, modifiers)`: Calculates an unrounded, high-precision conviction score.
  * `map_position_intent(conviction, direction)`: Maps conviction levels and direction indexes to position intents.
  * `apply_risk_budget_sizing(conviction, cvar_95)`: Sizes the recommended position based on the portfolio's active risk parameters.

---

### 3.9 Investment memo generator: `layer7_llm_interpreter.py`
Translates complex data structures into institutional investment memos while enforcing compliance guidelines.
* **Key Functions**:
  * `parse_draft_narrative(text)`: Inspects generated drafts for non-compliant price targets or certainty language.
  * `apply_compliance_replacements(text)`: Automatically replaces forbidden terms with compliant, probabilistic alternatives.
  * `apply_tonality_throttle(risk_level)`: Adjusts memo tonality from `confident` to `cautionary` based on volatility or regime signals.

---

### 3.10 Audits past recommendations: `layer8_meta_backtest.py`
Evaluates the quality of historical system decisions.
* **Key Functions**:
  * `audit_historical_avoids(price_history)`: Verifies if assets flagged as `AVOID` subsequently experienced drawdowns.
  * `audit_historical_initiates(price_history)`: Measures the forward expectancy of past `INITIATE` recommendations.
  * `compute_capital_protection_ratio()`: Computes the overall percentage of capital saved by system-directed exits.

---

### 3.11 Marginal Risk Contribution (MRC): `layer9_portfolio_risk.py`
Computes correlation-aware risk metrics across active assets.
* **Key Functions**:
  * `compute_marginal_risk_contribution(weights, volatilities, correlation_matrix)`: Measures the risk contribution of each asset.
  * `compute_effective_positions(weights)`: Calculates the HHI-inverse effective position count.
  * `apply_correlation_drag_caps(pairwise_corr)`: Scales down recommended position sizes when portfolio correlation is elevated.

---

### 3.12 Validation and coverage checks: `data_validator.py`
Performs integrity and coverage checks on raw time-series data.
* **Key Functions**:
  * `validate_daily_ohlcv(ticker_dir)`: Verifies that `history.parquet` contains required daily OHLCV rows.
  * `map_optional_layers(ticker_dir)`: Maps the presence of optional files to activate dynamic modifier layers.

---

### 3.13 Sanity checks: `pipeline_audit.py`
Audits database outputs and verifies system execution before deployment.
* **Key Functions**:
  * `audit_output_jsons(public_dir)`: Verifies that serialized JSON outputs conform to the required schemas.
  * `generate_audit_report()`: Compiles a validation summary, alerting the team to any data structure anomalies.

---

## SECTION 4: Step-by-Step Execution Sequence

When `daily_refresh.bat` is executed, the pipeline runs through the following sequence:

```
[Trigger] ──► [daily_refresh_orchestrator.py]
                   │
                   ├──► 1. Read 'state/refresh_registry.json'
                   ├──► 2. Run 'data_validator.py' (Excludes incomplete assets)
                   ├──► 3. Fetch NSE FII/DII data via 'fii_dii_pipeline.py'
                   ├──► 4. Run 'run_full_daily_intelligence.py'
                   │         (Executes quantitative Layers 1-14)
                   ├──► 5. Validate outputs against Schema v2.3-authority
                   ├──► 6. Serialize JSONs to 'public/intelligence/'
                   └──► 7. Trigger Vite build and Git versioning deployment
```

---

## SECTION 5: Guide for Onboarding Team Members

### 5.1 Pipeline Launch Options
1. **Full Automated Execution**:
   To trigger the entire daily refresh process, open PowerShell inside `E:\FinVest2\` and run:
   ```powershell
   .\daily_refresh.bat
   ```
2. **Targeted Python Run**:
   To bypass batch scripts and execute the orchestrator directly inside the Python virtual environment:
   ```powershell
   .venv\Scripts\python.exe FinSight\daily_refresh_orchestrator.py
   ```
3. **Single Stock Intelligence Debugging**:
   To isolate the processing logic for a specific asset without updating the global database:
   ```powershell
   .venv\Scripts\python.exe -m FinSight.quant_system.run_full_daily_intelligence --market US --ticker AAPL
   ```

### 5.2 System Integrity Verification
To verify data structures and pipeline integrity before deployment:
* Run the startup validation suite:
  ```powershell
  .venv\Scripts\python.exe -m FinSight.quant_system.data_validator
  ```
* Run the quantitative system audit tool to check for structural output consistency:
  ```powershell
  .venv\Scripts\python.exe -m FinSight.quant_system.pipeline_audit
  ```

---
*Report compiled by Antigravity AI Coding Assistant.*
---
