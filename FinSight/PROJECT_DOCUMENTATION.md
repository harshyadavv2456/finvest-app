# FinSight - Complete Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Data Architecture](#data-architecture)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [AI Analysis System](#ai-analysis-system)
7. [Deployment & Infrastructure](#deployment--infrastructure)
8. [Known Issues & Limitations](#known-issues--limitations)
9. [Development Workflow](#development-workflow)
10. [API Reference](#api-reference)

---

## Project Overview

**FinSight** is a premium stock screening and analysis platform that provides comprehensive financial data analysis, AI-powered insights, and professional-grade visualization tools. The platform is designed to function entirely on local data, eliminating dependency on real-time market data APIs while providing a Bloomberg Terminal-inspired user experience.

### Core Features

1. **Advanced Stock Screener**: Filter and sort stocks by 40+ financial metrics
2. **Interactive Charts**: Daily and intraday price charts with technical indicators
3. **Comprehensive Financial Analysis**: Complete fundamentals, quarterly results, and financial statements
4. **AI-Powered Insights**: Buy-side analyst-grade analysis using Groq LLM
5. **Peer Comparison**: Compare stocks within the same industry/sector
6. **News Integration**: Recent news filtered by relevance and recency
7. **Multi-Market Support**: India, USA, UK, Japan, China, Singapore, and others

### Design Philosophy

- **100% Local Data**: All stock data is stored locally in Parquet and JSON formats
- **No External Dependencies**: Except for Groq API for AI analysis
- **Premium UI/UX**: Bloomberg Terminal-inspired dark theme interface
- **Performance-First**: Optimized data loading with caching and parallel processing
- **Data-Driven**: All analysis is based on actual financial data, no hallucinations

---

## Architecture & Technology Stack

### Backend Stack

**Framework**: FastAPI (Python 3.11+)
- Modern, high-performance web framework
- Automatic API documentation
- Async/await support for concurrent requests

**Core Libraries**:
- **Pandas 2.2.3**: Data manipulation and analysis
- **PyArrow >=18.0.0**: Efficient Parquet file reading/writing
- **Pydantic 2.9.2**: Data validation and serialization
- **Groq >=0.12.0**: LLM API for AI insights
- **Uvicorn**: ASGI server for FastAPI

**Key Design Patterns**:
- **Repository Pattern**: Data access layer (`data_access.py`) abstracts file I/O
- **Service Layer**: Business logic separated from API endpoints
- **Caching Strategy**: In-memory cache with configurable TTL (default: 5 minutes)
- **Error Handling**: Comprehensive error handling with structured responses

### Frontend Stack

**Framework**: React 18+ with TypeScript
- Type-safe development
- Component-based architecture
- React Router for client-side routing

**Build Tool**: Vite
- Fast HMR (Hot Module Replacement)
- Optimized production builds
- Modern ES modules

**UI Libraries**:
- **Tailwind CSS**: Utility-first CSS framework
- **Recharts**: Charting library for financial visualizations
- **Lucide React**: Icon library
- **React Hook Form**: Form management

**State Management**:
- React Hooks (useState, useEffect)
- Local component state
- API client with axios

### Data Storage

**Format**: Parquet (columnar) + JSON
- **Parquet**: Efficient storage for time-series data (OHLCV, technicals)
- **JSON**: Flexible storage for nested financial data (fundamentals, news)

**Directory Structure**:
```
data/
  <MARKET>/              # IN, US, UK, JP, CN, SG, HK, OTHER
    <TICKER>/            # e.g., RELIANCE.NS, AAPL
      history.parquet           # Daily OHLCV data
      minute_1m.parquet         # 1-minute intraday data
      tech_indicators.parquet   # SMA, EMA, RSI, etc.
      financials_full.json      # Complete fundamentals
      news.json                 # News articles (canonical)
      metadata.json             # Ticker metadata
```

---

## Data Architecture

### Data Schema

#### 1. Daily Price Data (`history.parquet`)

**Index**: UTC timezone-aware datetime
**Columns**:
- `Open`, `High`, `Low`, `Close`: OHLC prices
- `Adj Close`: Adjusted close price (for splits/dividends)
- `Volume`: Trading volume
- `local_timestamp`: Exchange-local timezone timestamp

**Characteristics**:
- Timezone-aware index (UTC)
- Handles multiple markets with different timezones
- Supports both regular and adjusted prices

#### 2. Technical Indicators (`tech_indicators.parquet`)

**Index**: UTC timezone-aware datetime (matches history.parquet)
**Columns**:
- `SMA20`, `SMA50`, `SMA200`: Simple Moving Averages
- `EMA20`, `EMA50`: Exponential Moving Averages
- `RSI14`: Relative Strength Index (14-period)
- `returns`: Daily returns (for volatility calculation)

**Computation**:
- Calculated from daily price data
- Updated when new price data is added
- Cached for performance

#### 3. Fundamentals (`financials_full.json`)

**Structure**:
```json
{
  "info": {
    "longName": "Company Name",
    "sector": "Technology",
    "industry": "Software",
    "marketCap": 1000000000,
    "trailingPE": 25.5,
    "returnOnEquity": 0.15,
    ...
  },
  "fast_info": { ... },
  "income_statement": {
    "2025-03-31 00:00:00": { ... },
    "2024-03-31 00:00:00": { ... }
  },
  "balance_sheet": { ... },
  "cashflow_statement": { ... },
  "derived": {
    "market_cap": 1000000000,
    "trailing_pe": 25.5,
    ...
  }
}
```

**Key Features**:
- Hierarchical structure for different data types
- Date-based keys for time-series financial statements
- Derived metrics pre-computed for performance

#### 4. News Data (`news.json`)

**Format**: Array of news items
```json
[
  {
    "ticker": "RELIANCE.NS",
    "title": "News headline",
    "publisher": "Source",
    "link": "https://...",
    "type": "earnings",
    "provider_time_utc": "2025-01-15T10:30:00Z",
    "summary": "Optional summary"
  }
]
```

**Filtering**:
- Only news from last 3 years is shown
- Sorted by timestamp (newest first)
- Normalized format for consistency

#### 5. Metadata (`metadata.json`)

**Structure**:
```json
{
  "ticker": "RELIANCE.NS",
  "market": "IN",
  "exchange_tz": "Asia/Kolkata",
  "updated_utc": "2025-01-15T10:00:00Z",
  "daily_rows": 2520,
  "minute_rows": 500000
}
```

**Purpose**:
- Quick ticker discovery
- Data freshness tracking
- Market and timezone information

### Data Loading Strategy

**On-Demand Loading**:
- Data is loaded from files only when requested
- No pre-loading of all data into memory
- Efficient for large datasets

**Caching**:
- Screener data cached in-memory for 5 minutes (configurable)
- Reduces file I/O for frequently accessed endpoints
- Cache invalidated after TTL expires

**Parallel Processing**:
- Screener data loading uses `ThreadPoolExecutor` for parallel file reads
- Falls back to sequential loading if parallel fails
- Optimized for multi-core systems

---

## Backend Implementation

### Core Modules

#### 1. Configuration (`config.py`)

**Purpose**: Centralized configuration management

**Key Settings**:
- `DATA_DIR`: Path to data directory (resolved dynamically for local/Render)
- `GROQ_API_KEY`: API key for Groq LLM (from environment variable)
- `GROQ_MODEL`: Model name (default: "llama-3.1-8b-instant")
- `CORS_ORIGINS`: Allowed origins for CORS (comma-separated string)
- `SCREENER_CACHE_TTL`: Cache TTL in seconds (default: 300)

**Path Resolution**:
- Handles both local development and Render deployment
- Tries multiple possible data directory locations
- Logs the resolved path for debugging

**Environment Variables**:
- Reads from `.env` file or environment
- Supports both development and production configurations
- Secure handling of API keys

#### 2. Data Access Layer (`data_access.py`)

**Purpose**: Abstract file I/O operations

**Key Functions**:
- `list_tickers()`: Discovers all tickers by scanning metadata.json files
- `load_daily()`: Loads daily OHLCV data from history.parquet
- `load_minute()`: Loads intraday data from minute_1m.parquet
- `load_technicals()`: Loads technical indicators
- `load_fundamentals()`: Loads financial data from JSON
- `load_news()`: Loads and filters news (last 3 years only)
- `load_metadata()`: Loads ticker metadata

**Error Handling**:
- Returns empty DataFrames/dicts on file not found
- Logs warnings for missing files
- Graceful degradation (app continues if some data missing)

**Timezone Handling**:
- All timestamps normalized to UTC
- Preserves local timestamps for display
- Uses `ensure_utc_index()` utility function

#### 3. Screener Engine (`screener_engine.py`)

**Purpose**: Computes screener metrics for each ticker

**Function**: `compute_screener_row()`

**Inputs**:
- `ticker`: Ticker symbol
- `daily_df`: Daily price DataFrame
- `tech_df`: Technical indicators DataFrame
- `fundamentals`: Financial data dict
- `metadata`: Ticker metadata

**Output**: Flat dictionary with all screener metrics

**Metrics Computed**:

**Identity**:
- `ticker`, `market`, `exchange_tz`, `currency`
- `company_name`, `industry`, `sector`

**Price & Size**:
- `current_price`: Latest adjusted close price
- `market_cap`: From fundamentals or computed
- `shares_outstanding_est`: Estimated shares

**Valuation**:
- `pe_trailing`, `pe_forward`: Price-to-earnings ratios
- `pb_ratio`: Price-to-book ratio
- `price_to_sales`: P/S ratio
- `earnings_yield`: 1/PE * 100
- `dividend_yield`: Annual dividend yield

**Quality**:
- `roe`: Return on Equity (%)
- `roa`: Return on Assets (%)
- `profit_margin`: Net profit margin (%)
- `debt_to_equity`: Debt-to-equity ratio
- `roce`: Return on Capital Employed (%)

**Momentum & Returns**:
- `ret_1d`, `ret_1w`, `ret_1m`, `ret_3m`, `ret_6m`, `ret_1y`: Returns over different periods
- `high_52w`, `low_52w`: 52-week high/low
- `pct_from_52w_high`, `pct_from_52w_low`: Distance from extremes

**Technicals**:
- `sma20`, `sma50`, `sma200`: Moving averages
- `rsi14`: Relative Strength Index
- `price_above_sma50`, `price_above_sma200`: Boolean flags
- `golden_cross_50_200`: Golden cross detection

**Volume**:
- `volume_latest`: Latest trading volume
- `avg_volume_20d`, `avg_volume_60d`: Average volumes
- `volume_spike_20d`: Volume spike ratio

**Volatility**:
- `vol_20d`, `vol_60d`: Annualized volatility (%)

**Computation Logic**:
- Uses adjusted close prices for all calculations
- Handles missing data gracefully (returns None)
- Converts percentages to appropriate format
- Validates data before computation

#### 4. Main API (`main.py`)

**Purpose**: FastAPI application with all endpoints

**Lifespan Events**:
- **Startup**: Logs configuration, checks data directory, attempts data download if missing
- **Shutdown**: Cleanup and logging

**CORS Configuration**:
- Automatically includes common Vercel domains
- Includes custom domain (`finsight.fintaxlife.com`)
- Supports localhost for development
- Configurable via `CORS_ORIGINS` environment variable

**Key Endpoints**:

**Health Check** (`/health`, `/api/health`):
- Returns server status
- Checks if screener data is available
- Useful for deployment monitoring

**Tickers List** (`/api/tickers`):
- Returns list of all available tickers
- Includes basic metrics (price, PE, market cap)
- Fast endpoint for ticker discovery

**Screener** (`/api/screener`):
- Main screener endpoint with filtering and sorting
- Supports multiple filter types:
  - Market filter (IN, US, UK, etc.)
  - Numeric filters (min/max for PE, ROE, market cap, etc.)
  - Search filter (ticker, company name, market)
- Sorting by any numeric field
- Market priority: India, USA, UK, Japan, China, Singapore, then others
- Pagination support (limit, offset)
- Returns `ScreenerResponse` with rows, total, limit, offset

**Ticker Detail Endpoints**:
- `/api/ticker/{ticker}/daily`: Daily OHLCV data
- `/api/ticker/{ticker}/minute`: Intraday data
- `/api/ticker/{ticker}/fundamentals`: Financial data
- `/api/ticker/{ticker}/news`: News articles
- `/api/ticker/{ticker}/quarterly`: Quarterly financial statements
- `/api/ticker/{ticker}/peers`: Peer companies (same industry/sector)
- `/api/ticker/{ticker}/sector-news`: News from sector peers

**AI Insights** (`/api/ticker/{ticker}/ai-insights`):
- POST endpoint for AI analysis
- Uses `generate_analyst_insights()` from `ai_analysis_v2.py`
- Returns comprehensive analyst-grade analysis
- Handles errors gracefully

**Ratios** (`/api/ratios`):
- Returns list of available ratios with metadata
- Used by frontend for dynamic filter/sort UI

**Data Loading Strategy**:
- Screener data loaded from cache or files
- Parallel loading for initial cache population
- Sequential loading for reliability (AI endpoint)
- Error handling: continues if individual tickers fail

**Search Implementation**:
- Boolean mask with proper index alignment
- Searches across ticker, company_name, and market
- Case-insensitive matching
- Handles missing data gracefully

#### 5. AI Analysis (`ai_analysis.py` & `ai_analysis_v2.py`)

**Purpose**: Generate AI-powered stock analysis

**Two Implementations**:

**1. Basic AI Analysis** (`ai_analysis.py`):
- Simple analysis with summary, bull/bear cases, key metrics
- Uses `generate_ai_insights()` function
- Suitable for quick insights

**2. Analyst-Grade Analysis** (`ai_analysis_v2.py`):
- Comprehensive 11-dimension analysis
- Uses `generate_analyst_insights()` function
- Production-ready implementation

**Analyst-Grade Analysis Dimensions**:

1. **Business & Context**: Company description, market position, competitive position
2. **Quality of Business**: Profitability trends, ROE/ROA analysis, margin stability
3. **Growth**: Revenue and earnings growth trends, classification (compounder/cyclical/turnaround)
4. **Balance Sheet & Leverage**: Debt analysis, cash position, refinancing risk
5. **Cash Flow Quality**: Operating cash flow vs net income, free cash flow
6. **Valuation**: PE, PB relative to growth/quality and peers
7. **Momentum & Technicals**: Trend analysis, RSI, volume patterns
8. **Risk Profile**: Volatility, drawdowns, leverage risk, sector cyclicality
9. **News & Events**: Recent news summary, tone analysis
10. **Peer Comparison**: Valuation and quality vs peers
11. **Final Verdict**: Summary, bull/bear cases, metrics to watch, time horizon, risk profile

**Prompt Engineering**:
- Structured prompt with all available data
- Explicit instructions for each dimension
- Format requirements for consistent parsing
- Data-driven analysis (no hallucinations)

**Response Parsing**:
- First attempts JSON parsing (if LLM returns JSON)
- Falls back to flexible text parsing
- Case-insensitive section detection
- Multi-line content extraction
- Markdown stripping for clean text
- Fallback to raw content if parsing fails

**Error Handling**:
- Graceful handling of missing API key
- Timeout protection (45 seconds)
- Structured error responses
- Logging for debugging

**Safe Number Formatting**:
- `fmt_num()` helper function prevents `NoneType.__format__` errors
- Handles None, NaN, and missing values
- Returns "N/A" for unformatable values
- Used throughout AI prompt generation

**Known Issue - AI Reliability**:
⚠️ **IMPORTANT**: The AI analysis feature sometimes works and sometimes doesn't. This is due to:
- Groq API rate limits or temporary unavailability
- Network connectivity issues
- API key expiration or invalidation
- Model availability (free tier limitations)
- Response parsing failures (LLM doesn't follow format exactly)

**Workarounds**:
- Retry the request if it fails
- Check backend logs for specific error messages
- Verify GROQ_API_KEY is set correctly
- Monitor Groq API status

#### 6. Schemas (`schemas.py`)

**Purpose**: Pydantic models for API request/response validation

**Key Models**:
- `TickerBasic`: Basic ticker information
- `ScreenerRow`: Complete screener row schema (40+ fields)
- `ScreenerResponse`: Paginated screener response
- `DailyDataResponse`: Daily price data with technicals
- `MinuteDataResponse`: Intraday price data
- `FundamentalsResponse`: Financial data structure
- `NewsItem`: News article schema
- `AIInsightsResponse`: AI analysis response schema
- `QuarterlyDataResponse`: Quarterly financial statements
- `RatioMetadata`: Ratio metadata for UI

**Validation**:
- Automatic type checking
- Optional fields handled correctly
- NaN/None conversion for Pydantic compatibility
- Consistent data contracts

---

## Frontend Implementation

### Architecture

**Component Structure**:
```
src/
  components/          # Reusable UI components
    ScreenerTable.tsx      # Main screener table
    SearchBar.tsx          # Search functionality
    AdvancedFilters.tsx    # Filter UI
    ChartPanel.tsx        # Price charts
    AIInsightsPanel.tsx    # AI analysis display
    PeerComparison.tsx     # Peer comparison table
    QuarterlyResults.tsx   # Quarterly financials
    FinancialStatements.tsx # Annual financials
    FinancialsCharts.tsx   # Financial visualization
    TechnicalsGauges.tsx   # Technical indicators
    SeasonalsChart.tsx     # Seasonal patterns
    NewsPanel.tsx          # News display
    SectorNews.tsx         # Sector news
  pages/
    StockDetail.tsx        # Stock detail page
  lib/
    api.ts                 # API client
```

### Key Components

#### 1. Screener Table (`ScreenerTable.tsx`)

**Features**:
- Sortable columns (click header to sort)
- Search bar (ticker, company name, market)
- Market filter dropdown
- Advanced filters (PE, ROE, market cap, etc.)
- Pagination (500 rows per page)
- Click row to navigate to stock detail

**State Management**:
- `rows`: Screener data
- `filters`: Filter state
- `sortField`, `sortDir`: Sorting state
- `searchQuery`: Search text
- `loading`: Loading state

**API Integration**:
- Calls `/api/screener` with filter/sort params
- Debounced search (updates after typing stops)
- Handles errors gracefully

#### 2. Stock Detail Page (`StockDetail.tsx`)

**Tabbed Interface**:
- **Overview**: Key metrics, price summary
- **Chart**: Daily/intraday price charts
- **Analysis**: AI insights, technical gauges
- **Peers**: Peer comparison table
- **Quarters**: Quarterly financial statements
- **Financials**: Annual financial statements
- **News**: Company and sector news

**Data Loading**:
- Loads screener row for ticker
- Loads daily data, fundamentals, news in parallel
- Shows loading state during fetch
- Error handling with user-friendly messages

**Currency Display**:
- Automatically detects currency from market
- Displays appropriate currency symbol (₹, $, £, ¥, etc.)
- Consistent formatting across all financial displays

#### 3. API Client (`lib/api.ts`)

**Purpose**: Centralized API communication

**Features**:
- Type-safe API calls with TypeScript interfaces
- Automatic `/api` prefix handling
- Environment variable support (`VITE_API_URL`)
- Timeout configuration (10 seconds)
- Error handling

**Key Functions**:
- `getTickers()`: List all tickers
- `getScreener()`: Filtered screener results
- `getTickerDaily()`: Daily price data
- `getTickerFundamentals()`: Financial data
- `getAIInsights()`: AI analysis (POST with fallback to GET)
- `getTickerPeers()`: Peer companies
- `getTickerQuarterly()`: Quarterly results
- `getRatios()`: Available ratios

**Configuration**:
- `API_BASE`: Resolved from `VITE_API_URL` or defaults to `/api`
- Removes trailing slashes
- Handles both local dev and production

### UI/UX Design

**Theme**: Bloomberg Terminal-inspired
- Dark background (`bg-bloomberg-dark`)
- High contrast text
- Gradient accents
- Professional financial aesthetic

**Color Scheme**:
- Primary: Blue gradients
- Success: Green (positive returns)
- Danger: Red (negative returns)
- Muted: Gray for secondary text

**Responsive Design**:
- Works on desktop and tablet
- Mobile-friendly layouts
- Adaptive column widths

**Performance Optimizations**:
- Lazy loading of components
- Debounced search
- Cached API responses
- Optimized re-renders

---

## Deployment & Infrastructure

### Production Deployment

**Frontend**: Vercel
- Automatic deployments from GitHub
- Environment variables: `VITE_API_URL`
- Custom domain: `finsight.fintaxlife.com`
- Preview deployments for pull requests

**Backend**: Render
- Free tier web service
- Automatic deployments from GitHub
- Environment variables:
  - `GROQ_API_KEY`: Groq API key
  - `CORS_ORIGINS`: Comma-separated allowed origins
- Python 3.11 (specified in `runtime.txt`)
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Configuration Files**:
- `render.yaml`: Render blueprint configuration
- `backend/Procfile`: Process file (not used, render.yaml takes precedence)
- `runtime.txt`: Python version specification
- `frontend/vercel.json`: Vercel configuration

### Data Deployment

**Strategy**: Data committed to GitHub
- All data files under 50MB (GitHub file size limit)
- Committed directly to repository
- No external data hosting required
- Automatic download on Render if data missing (via `download_data.py`)

**Data Download Script** (`download_data.py`):
- Downloads `finsight-data.zip` from GitHub Release
- Extracts to data directory
- Runs automatically on backend startup if data missing
- Handles errors gracefully

### CORS Configuration

**Automatic Origin Inclusion**:
- `https://finsight.fintaxlife.com` (custom domain)
- `https://finsight-sand.vercel.app` (Vercel preview)
- `https://finsight-git-main-*.vercel.app` (Vercel deployments)
- `http://localhost:5173` (local development)

**Manual Configuration**:
- Can be set via `CORS_ORIGINS` environment variable
- Comma-separated string format
- Merged with default origins

### Environment Variables

**Backend**:
- `GROQ_API_KEY`: Required for AI analysis
- `CORS_ORIGINS`: Optional, comma-separated origins
- `SCREENER_CACHE_TTL`: Optional, cache TTL in seconds

**Frontend**:
- `VITE_API_URL`: Backend API URL (e.g., `https://finsight-backend-6g5r.onrender.com`)

### Local Development

**Backend**:
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

**Startup Scripts**:
- `start_backend.ps1`: PowerShell script to start backend
- `start_frontend.ps1`: PowerShell script to start frontend
- `start_all.ps1`: Start both services

---

## Known Issues & Limitations

### 1. AI Analysis Reliability ⚠️

**Issue**: AI analysis sometimes works and sometimes doesn't.

**Causes**:
- Groq API rate limits (free tier limitations)
- Network connectivity issues
- API key expiration
- Model availability
- Response parsing failures (LLM doesn't follow format)

**Symptoms**:
- "AI analysis unavailable" error
- "Response parsing incomplete" warning
- Empty or partial analysis
- Timeout errors

**Workarounds**:
- Retry the request
- Check backend logs
- Verify API key
- Wait and try again later

**Future Improvements**:
- Implement retry logic with exponential backoff
- Add response validation
- Cache successful responses
- Fallback to simpler analysis if comprehensive fails

### 2. Data Freshness

**Issue**: Data is static (not real-time).

**Limitation**: All data is from local files, not live market data.

**Impact**: Prices and metrics may be outdated.

**Solution**: Regular data updates via crawler script.

### 3. Search Performance

**Issue**: Search can be slow with large datasets.

**Cause**: Sequential string matching across all rows.

**Optimization**: Could be improved with indexing or full-text search.

### 4. Memory Usage

**Issue**: Large datasets can consume significant memory.

**Mitigation**: 
- On-demand loading (not all data in memory)
- Caching with TTL
- Pagination for large result sets

### 5. Error Handling

**Issue**: Some edge cases may not be handled gracefully.

**Areas for Improvement**:
- Better error messages for users
- Retry logic for transient failures
- Fallback data sources

---

## Development Workflow

### Adding New Metrics

1. **Update Screener Engine** (`screener_engine.py`):
   - Add computation logic in `compute_screener_row()`
   - Handle missing data (return None)

2. **Update Schema** (`schemas.py`):
   - Add field to `ScreenerRow` model
   - Mark as Optional if data may be missing

3. **Update Frontend** (`lib/api.ts`):
   - Add field to `ScreenerRow` interface
   - Update display in `ScreenerTable.tsx` if needed

4. **Test**:
   - Verify metric computes correctly
   - Test with missing data
   - Check frontend display

### Adding New Endpoints

1. **Define Schema** (`schemas.py`):
   - Create request/response models

2. **Implement Endpoint** (`main.py`):
   - Add route handler
   - Implement business logic
   - Add error handling

3. **Update Frontend** (`lib/api.ts`):
   - Add API call function
   - Create TypeScript interface

4. **Test**:
   - Test endpoint directly (FastAPI docs)
   - Test from frontend
   - Handle errors

### Data Updates

1. **Run Crawler**:
   - Execute data crawler script
   - Updates parquet and JSON files

2. **Clear Cache**:
   - Restart backend to clear screener cache
   - Or wait for TTL expiration

3. **Verify**:
   - Check screener shows updated data
   - Verify metrics are recalculated

### Debugging

**Backend Logs**:
- Check console output for errors
- Look for file not found warnings
- Verify data directory path

**Frontend Console**:
- Check browser console (F12)
- Look for API errors
- Verify API_BASE URL

**Network Tab**:
- Inspect API requests
- Check response status codes
- Verify CORS headers

---

## API Reference

### Base URL

**Local**: `http://localhost:8000`
**Production**: `https://finsight-backend-6g5r.onrender.com`

### Endpoints

#### Health Check
```
GET /health
GET /api/health
```
**Response**:
```json
{
  "status": "ok",
  "screener_available": true,
  "screener_path": "/path/to/screener.parquet"
}
```

#### List Tickers
```
GET /api/tickers
```
**Response**: Array of `TickerBasic` objects

#### Screener
```
GET /api/screener?market=IN&min_pe=10&max_pe=30&sort_by=market_cap&sort_dir=desc&limit=100&offset=0
```
**Query Parameters**:
- `market`: Market filter (IN, US, UK, etc.)
- `min_pe`, `max_pe`: PE ratio filters
- `min_roe`: Minimum ROE
- `min_market_cap`, `max_market_cap`: Market cap filters
- `search`: Search query (ticker, company name, market)
- `sort_by`: Field to sort by
- `sort_dir`: `asc` or `desc`
- `limit`: Results per page
- `offset`: Pagination offset

**Response**: `ScreenerResponse` object

#### Ticker Daily Data
```
GET /api/ticker/{ticker}/daily
```
**Response**: `DailyDataResponse` object

#### Ticker Fundamentals
```
GET /api/ticker/{ticker}/fundamentals
```
**Response**: `FundamentalsResponse` object

#### Ticker News
```
GET /api/ticker/{ticker}/news
```
**Response**: Array of `NewsItem` objects

#### AI Insights
```
POST /api/ticker/{ticker}/ai-insights
Content-Type: application/json

{
  "strategy_context": "Optional context string"
}
```
**Response**: `AIInsightsResponse` object

#### Peer Comparison
```
GET /api/ticker/{ticker}/peers?limit=10
```
**Response**:
```json
{
  "peers": [...],
  "industry": "Technology",
  "sector": "Software"
}
```

#### Quarterly Results
```
GET /api/ticker/{ticker}/quarterly
```
**Response**: `QuarterlyDataResponse` object

#### Sector News
```
GET /api/ticker/{ticker}/sector-news?limit=20
```
**Response**:
```json
{
  "news": [...],
  "industry": "Technology",
  "sector": "Software"
}
```

#### Ratios
```
GET /api/ratios
```
**Response**: `RatiosResponse` object with available ratios metadata

---

## Conclusion

FinSight is a comprehensive stock screening and analysis platform built with modern technologies and best practices. The architecture is designed for scalability, maintainability, and performance. While there are some known limitations (particularly around AI analysis reliability), the platform provides a solid foundation for financial data analysis and can be extended with additional features as needed.

**Key Strengths**:
- 100% local data (no external dependencies)
- Comprehensive financial metrics
- Professional UI/UX
- Scalable architecture
- Type-safe development

**Areas for Future Enhancement**:
- Real-time data updates
- Advanced charting features
- Backtesting capabilities
- Watchlists and alerts
- Export functionality
- Improved AI reliability

---

**Last Updated**: January 2025
**Version**: 1.0.0
**Maintainer**: FinSight Development Team

**Website**: [www.fintaxlife.com](https://www.fintaxlife.com)

