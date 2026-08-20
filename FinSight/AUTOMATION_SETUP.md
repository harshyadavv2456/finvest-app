# FinSight Automation Setup Guide

## 🎯 Overview

This guide explains how to set up **fully automated data updates** for FinSight. Once configured, the system will:

1. ✅ Automatically fetch stock prices, fundamentals, and news (Screener)
2. ✅ Automatically fetch option chain data (StrataX)
3. ✅ Auto-commit and push changes to GitHub
4. ✅ Trigger auto-deployment on Render (backend) and Vercel (frontend)

**No manual intervention required!**

---

## 📋 Prerequisites

Before setting up automation, ensure you have:

1. FinSight repository on GitHub
2. Render account with backend deployed
3. Vercel account with frontend deployed
4. GitHub repository with write access

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Push Workflow Files to GitHub

The automation files have been created. You need to push them to GitHub:

```powershell
# Navigate to your project
cd C:\Users\HARSH\OneDrive\Desktop\FinSight

# Add all new files
git add .github/workflows/auto-update-data.yml
git add scripts/automation_runner.py
git add AUTOMATION_SETUP.md

# Commit
git commit -m "Add GitHub Actions automation for data updates"

# Push
git push origin main
```

### Step 2: Configure GitHub Secrets (Optional but Recommended)

Go to your GitHub repository:
1. Click **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `GROQ_API_KEY` | Groq API key for AI analysis | `gsk_xxxxx...` |

> Note: The GROQ_API_KEY is already in render.yaml, but adding it as a secret is more secure.

### Step 3: Verify Auto-Deploy Settings

**On Render:**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your `finsight-backend` service
3. Go to **Settings** → **Build & Deploy**
4. Ensure **Auto-Deploy** is set to **Yes**

**On Vercel:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your FinSight project
3. Go to **Settings** → **Git**
4. Ensure your main branch is configured for auto-deploy

### Step 4: Test the Workflow

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **FinSight Auto Data Update**
4. Click **Run workflow** → **Run workflow**
5. Watch the workflow execute!

---

## ⏰ Schedule Details

The automation runs on the following schedule (IST):

| Time | What Happens |
|------|--------------|
| 9:15 AM | Market opens - First data fetch |
| Every 30 min | Data refresh (9:15 AM - 3:30 PM) |
| 3:30 PM | Market closes - Final data fetch |
| 4:00 PM | Extended hours end |

**Days:** Monday to Friday only (skips weekends)

### Cron Schedule (UTC)

```yaml
schedule:
  - cron: '15,45 3 * * 1-5'    # IST 8:45, 9:15
  - cron: '15,45 4-9 * * 1-5'  # IST 9:45 - 15:15
  - cron: '0,30 10 * * 1-5'    # IST 15:30, 16:00
```

---

## 📂 File Structure

```
FinSight/
├── .github/
│   └── workflows/
│       └── auto-update-data.yml    # GitHub Actions workflow
├── scripts/
│   └── automation_runner.py        # Unified automation script
├── backend/
│   └── scripts/
│       └── fetch_stratax_data.py   # StrataX data fetcher
├── update_all_data.py              # Master data update script
├── stock_crawler.py                # Stock data crawler
└── AUTOMATION_SETUP.md             # This file
```

---

## 🔧 Manual Commands

### Run Full Update Locally

```powershell
# Run everything
python scripts/automation_runner.py

# Run only screener
python scripts/automation_runner.py --screener-only

# Run only StrataX
python scripts/automation_runner.py --stratax-only

# Force run (ignore market hours)
python scripts/automation_runner.py --force

# Preview what would run
python scripts/automation_runner.py --dry-run
```

### Run StrataX Fetch Only

```powershell
cd backend

# Fetch single index
python scripts/fetch_stratax_data.py NIFTY

# Fetch all indices
python scripts/fetch_stratax_data.py --all

# Quiet mode (for automation)
python scripts/fetch_stratax_data.py --all --quiet
```

### Trigger GitHub Action Manually

1. Go to GitHub → Actions → FinSight Auto Data Update
2. Click "Run workflow"
3. Select options:
   - **Update type**: all / screener_only / stratax_only
   - **Force run**: Run even outside market hours

---

## 📊 Monitoring

### View Workflow Runs

1. Go to GitHub repository
2. Click **Actions** tab
3. See all workflow runs with status

### Check Workflow Logs

1. Click on any workflow run
2. Click on the job (e.g., "update-finsight-data")
3. Expand any step to see detailed logs

### Check Deployment Status

**Render:**
- Go to Render Dashboard → Your service → Events

**Vercel:**
- Go to Vercel Dashboard → Your project → Deployments

---

## ⚠️ Important Considerations

### GitHub Actions Limits (Free Tier)

- **2,000 minutes/month** for free accounts
- Each run uses ~5-15 minutes
- Current schedule: ~140 runs/month × 10 min = ~1,400 minutes

**If you exceed limits:**
1. Reduce frequency (hourly instead of 30 min)
2. Upgrade to GitHub Pro ($4/month = 3,000 minutes)
3. Use a self-hosted runner

### Data Storage

Your `data/` folder contains parquet files. GitHub recommends:
- Keep repo under 5 GB
- Individual files under 100 MB

**If you hit limits:**
1. Use Git LFS for large files
2. Archive old data
3. Store data externally (S3, R2)

### Rate Limits

- **yfinance**: May block if too many requests
- **NSE**: Has rate limiting

The scripts include delays to avoid rate limiting.

---

## 🔄 How It All Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    GITHUB ACTIONS                                │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │  CRON: Every 30 min (9:15 AM - 4:00 PM IST, Mon-Fri)   │  │
│    │                                                         │  │
│    │  1. Check if market is open                             │  │
│    │  2. Run update_all_data.py (screener)                   │  │
│    │  3. Run fetch_stratax_data.py --all (options)           │  │
│    │  4. Rebuild screener snapshot                           │  │
│    │  5. If changes: commit & push                           │  │
│    └─────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                    Git Push to main branch                       │
└─────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           ▼                                       ▼
┌────────────────────┐              ┌────────────────────┐
│  RENDER (Backend)  │              │  VERCEL (Frontend) │
│                    │              │                    │
│  Detects push      │              │  Detects push      │
│  Rebuilds & deploy │              │  Rebuilds & deploy │
│  ~2-5 minutes      │              │  ~1-2 minutes      │
└────────────────────┘              └────────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  LIVE WEBSITE    │
                    │  Updated data!   │
                    └──────────────────┘
```

---

## 🐛 Troubleshooting

### Workflow Not Running

1. Check if workflow file is in `.github/workflows/`
2. Verify workflow is enabled (Actions → Select workflow → Enable)
3. Check if repo has Actions enabled (Settings → Actions → General)

### Data Not Updating

1. Check workflow logs for errors
2. Verify API keys are correct
3. Check if market is open (or use force flag)

### Deployment Not Triggering

1. Verify auto-deploy is enabled on Render/Vercel
2. Check if there were actual file changes
3. Look at deployment logs

### Rate Limited

1. Increase delay between requests
2. Reduce update frequency
3. Check if IP is blocked (try VPN)

---

## 📞 Support

If you encounter issues:

1. Check GitHub Actions logs
2. Review this documentation
3. Check Render/Vercel deployment logs

---

## ✅ Checklist

- [ ] Workflow file pushed to GitHub
- [ ] GitHub Actions enabled on repository
- [ ] Secrets configured (optional)
- [ ] Render auto-deploy enabled
- [ ] Vercel auto-deploy enabled
- [ ] Manual test run successful
- [ ] First automated run successful

---

**🎉 Once set up, FinSight will update automatically every 30 minutes during market hours!**

