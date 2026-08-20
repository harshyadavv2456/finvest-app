# FinSight - Premium Stock Screening & Analysis Platform

![FinSight](FinSight%20Logo.jpg)

FinSight is a premium web platform for stock screening, charting, and AI-powered analysis, powered entirely by local data and Groq LLM.

## ✨ Features

- **Advanced Stock Screener**: Filter and sort by 40+ metrics (PE, ROE, Market Cap, Returns, etc.)
- **Interactive Charts**: Daily and intraday price charts with technical indicators (SMA20/50/200)
- **Comprehensive Fundamentals**: Complete financial metrics and ratios
- **News Integration**: Latest news feed for each ticker
- **AI-Powered Insights**: Groq LLM analysis with bull/bear cases
- **Bloomberg-Inspired UI**: Professional dark theme interface
- **100% Local Data**: No external market data APIs required

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- Stock data in `data/` folder (already present)

### Windows

1. **Start Backend** (Terminal 1):
   ```bash
   start_backend.bat
   ```

2. **Start Frontend** (Terminal 2):
   ```bash
   start_frontend.bat
   ```

3. **Open Browser**: Navigate to `http://localhost:5173`

### Manual Setup

See `QUICKSTART.md` for detailed manual setup instructions.

## 📖 Documentation

- **QUICKSTART.md** - 5-minute setup guide
- **README_SETUP.md** - Detailed setup instructions
- **PROJECT_SUMMARY.md** - Complete project overview

## 🏗️ Architecture

### Backend
- **FastAPI** - Modern Python web framework
- **Pandas/PyArrow** - Data processing
- **Groq API** - AI analysis

### Frontend
- **React + TypeScript** - Modern UI framework
- **Vite** - Fast build tool
- **Tailwind CSS** - Styling
- **Recharts** - Charting library

## 📊 Data Structure

All data is stored locally in `data/` folder:
```
data/
  <MARKET>/
    <TICKER>/
      history.parquet          # Daily OHLCV
      minute_1m.parquet        # 1-minute intraday
      tech_indicators.parquet   # Technical indicators
      financials_full.json      # Fundamentals
      news.parquet             # News articles
      metadata.json            # Ticker metadata
```

## 🎯 Usage

1. **Screening**: Use filters to find stocks matching your criteria
2. **Analysis**: Click any row to see detailed analysis
3. **Charts**: Toggle between daily and intraday views
4. **AI Insights**: Click "Generate Insights" for AI analysis

## 🔧 Configuration

- Groq API key: `backend/app/config.py`
- API port: 8000 (backend), 5173 (frontend)
- Screener cache: 5 minutes TTL

## 📝 Rebuilding Screener

When new data is added, rebuild the screener snapshot:

```bash
cd backend
python -m app.screener_snapshot
```

## 🌐 API Endpoints

- `GET /api/tickers` - List all tickers
- `GET /api/screener` - Filtered screener results
- `GET /api/ticker/{ticker}/daily` - Daily price data
- `GET /api/ticker/{ticker}/minute` - Intraday data
- `GET /api/ticker/{ticker}/fundamentals` - Financials
- `GET /api/ticker/{ticker}/news` - News
- `POST /api/ticker/{ticker}/ai-insights` - AI analysis

## 🎨 Design Philosophy

- **Bloomberg-inspired**: Professional financial terminal aesthetic
- **Dark theme**: Easy on the eyes for extended use
- **Responsive**: Works on different screen sizes
- **Fast**: Optimized for performance

## 🔒 Data Privacy

- All data is stored locally
- No external market data APIs
- Only Groq API is used (for AI analysis)
- Your data stays on your machine

## 📈 Metrics Computed

- **Valuation**: PE, PB, PS, Earnings Yield, Dividend Yield
- **Quality**: ROE, ROA, Profit Margin, Debt/Equity
- **Momentum**: Returns (1d, 1w, 1m, 3m, 6m, 1y)
- **Volatility**: 20d, 60d annualized
- **Technicals**: SMA20/50/200, RSI14, Golden Cross
- **Volume**: Latest, averages, spikes

## 🤝 Contributing

This is a production-ready platform. Feel free to extend with:
- Backtesting functionality
- Watchlists
- Alerts
- Advanced charting
- Export features

## 📄 License

Private project - All rights reserved

## 🌟 Credits

- Built with FastAPI, React, and Groq
- Data from local crawler
- Design inspired by Bloomberg Terminal

---

**Visit**: [www.fintaxlife.com](https://www.fintaxlife.com)
