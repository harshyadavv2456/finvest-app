# FinSight Data Update Guide

## Quick Start - How to Update All Data

### Method 1: Master Update Script (Recommended)
```bash
python update_all_data.py
```

This single command will:
1. ✅ Update all ticker data (prices, fundamentals, news)
2. ✅ Automatically rebuild screener snapshot
3. ✅ Show you a summary of what was updated

### Method 2: Manual Step-by-Step
```bash
# Step 1: Update all tickers
python stock_crawler.py

# Step 2: Rebuild screener (if auto-rebuild was skipped)
cd backend
python scripts/master_data_fetcher.py
```

### Method 3: Update Specific Ticker
```bash
python stock_crawler.py --tick AAPL
# Screener will auto-rebuild after this
```

---

## What Gets Updated

When you run the update:

### 1. **Ticker Data** (via `stock_crawler.py`)
- ✅ Daily prices (`history.parquet`)
- ✅ Minute-level data (`minute_1m.parquet`) - last 7 days
- ✅ Technical indicators (`tech_indicators.parquet`)
- ✅ Fundamentals (`financials_full.json`)
- ✅ **Stock-specific news** (`news.parquet`) - from yfinance + RSS

### 2. **Screener Snapshot** (auto-rebuilt)
- ✅ `data/screener.parquet` - Fast binary format
- ✅ `data/screener.csv` - Human-readable format
- ✅ Includes ALL markets (US, IN, UK, JP, AU, etc.)
- ✅ All metrics computed from latest data

---

## News Organization

News is now automatically organized by relevance:

1. **Stock-Specific News** (First Priority)
   - News directly about the ticker
   - From yfinance API
   - Stock-specific RSS feeds

2. **Sector & Peer News** (Second Priority)
   - News from companies in same sector/industry
   - News mentioning the sector/industry
   - Helps understand broader market context

3. **Generic News** (Last Priority)
   - General market news
   - Less relevant but still useful

### Sentiment Analysis
- Each news item has sentiment: `positive`, `negative`, or `neutral`
- Sentiment score: -1.0 to +1.0
- Displayed with color-coded icons in frontend

---

## After Updating Data

### Step 1: Review Changes
Check the terminal output to see:
- How many tickers were updated
- How many news articles were fetched
- Screener snapshot status

### Step 2: Commit to Git
```bash
# Open GitHub Desktop
# OR use command line:

git add data/screener.parquet data/screener.csv
git commit -m "Update screener data - [DATE]"
git push origin main
```

**Note:** You don't need to commit individual ticker data files unless you want to. The screener snapshot is what matters for the website.

### Step 3: Auto-Deploy
- ✅ **Render** (Backend): Auto-deploys from `main` branch
- ✅ **Vercel** (Frontend): Auto-deploys from `main` branch
- ⏱️ Deployment takes 5-10 minutes

---

## Sector & Industry Filters

✅ **Already Working!**

The sector and industry filters are fully functional:
- Data comes from `financials_full.json` (per ticker)
- Extracted via `screener_engine.py`
- Stored in `screener.parquet`
- Available in frontend filters

**How it works:**
1. Backend loads sector/industry from fundamentals
2. Screener snapshot includes these fields
3. Frontend filter dropdowns populated from `/api/meta/filters`
4. Filtering works on screener endpoint

---

## Troubleshooting

### Issue: Screener not updating
**Solution:**
```bash
cd backend
python scripts/master_data_fetcher.py
```

### Issue: News not showing
**Check:**
- Is `news.parquet` file created in ticker folder?
- Check terminal logs for errors
- Verify yfinance API is working

### Issue: Sector/Industry filters empty
**Solution:**
- Rebuild screener: `python backend/scripts/master_data_fetcher.py`
- Check if `financials_full.json` has sector/industry data
- Verify data in `screener.csv`

### Issue: Auto-rebuild failed
**Solution:**
- Run manually: `python backend/scripts/master_data_fetcher.py`
- Check Python path and dependencies
- Verify `data/` directory exists

---

## Daily Update Workflow

### Recommended Schedule
Update data **once per day** (after market close):

```bash
# 1. Update all data
python update_all_data.py

# 2. Review output

# 3. Commit and push (if successful)
git add data/screener.parquet data/screener.csv
git commit -m "Daily data update - $(date +%Y-%m-%d)"
git push origin main
```

### Automated (Optional)
Set up a cron job or scheduled task to run `update_all_data.py` daily.

---

## Files Changed

### Code Files (Committed)
- ✅ `stock_crawler.py` - Auto-rebuilds screener
- ✅ `backend/app/news_utils.py` - Sentiment analysis & organization
- ✅ `backend/app/main.py` - Updated news endpoint
- ✅ `frontend/src/components/NewsPanel.tsx` - Organized display
- ✅ `frontend/src/lib/api.ts` - Updated API interface
- ✅ `frontend/src/pages/StockDetail.tsx` - Uses new news structure
- ✅ `update_all_data.py` - Master update script

### Data Files (Not Committed by Default)
- `data/screener.parquet` - Screener snapshot
- `data/screener.csv` - Screener CSV
- `data/*/news.parquet` - Per-ticker news
- Individual ticker data files

**Note:** Only commit `screener.parquet` and `screener.csv` to Git. Individual ticker data is too large.

---

## Summary

✅ **Everything is automated!**

1. Run `python update_all_data.py`
2. Wait for completion
3. Commit `screener.parquet` and `screener.csv` to Git
4. Push to GitHub
5. Render & Vercel auto-deploy

**That's it!** Your website will have the latest data with organized news and sentiment analysis.

