# FinVest Position Tracking & EXIT Signal System

## Overview

FinVest now tracks "virtual positions" based on INITIATE recommendations. When the system changes its stance from INITIATE to AVOID, it generates an **EXIT SIGNAL**.

This is NOT a paper trading system. It's a **RECOMMENDATION MEMORY** system.

## Core Concept

```
INITIATE → Track as "Open Position" → Monitor Daily → EXIT when AVOID
```

### What This Means for Users:

1. **When system says INITIATE**: "If you act on this, track it"
2. **While HOLD**: Position is monitored, no action needed
3. **When AVOID**: EXIT SIGNAL generated - "If you acted earlier, consider exiting"

## API Endpoints

### Position Tracker API (`/api/positions/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/positions/active/{market}` | GET | Get all tracked positions with current status |
| `/api/positions/exits/{market}` | GET | Get positions requiring EXIT action |
| `/api/positions/track/{market}/{ticker}` | POST | Start tracking a position |
| `/api/positions/untrack/{market}/{ticker}` | DELETE | Stop tracking a position |
| `/api/positions/sync/{market}` | POST | Sync with current intelligence data |
| `/api/positions/timeline/{market}/{ticker}` | GET | Get full stance history for a position |

### Response Format

```json
{
  "ticker": "AAPL",
  "market": "US",
  "entry_date": "2025-12-20",
  "entry_price": 250.50,
  "entry_conviction": 72.5,
  "current_intent": "AVOID",
  "current_conviction": 65.0,
  "current_price": 245.00,
  "days_held": 10,
  "suggested_holding_days": 30,
  "pnl_percent": -2.19,
  "status": "EXIT_SIGNAL",
  "exit_reason": "Stance changed to AVOID - Exit recommended",
  "exit_urgency": "urgent",
  "index_return": 1.5,
  "vs_index": -3.69
}
```

## Position Status Values

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `HOLD` | Position is active, no issues | None |
| `REDUCE` | Consider trimming position | Optional |
| `EXIT_SIGNAL` | Stance changed to AVOID | Exit recommended |
| `REVIEW` | Holding period exceeded | Review position |

## Exit Urgency Levels

| Level | Meaning |
|-------|---------|
| `normal` | Routine review needed |
| `urgent` | Exit soon - stance changed to AVOID |
| `critical` | Exit immediately - EXIT signal |

## Frontend Components

### ActivePositionsPage (`/positions`)

Shows:
- **EXIT Signals Alert**: Prominent display of positions needing exit
- **Stats Cards**: Total positions, exit signals, active holds, avg days held
- **Positions Table**: All tracked positions with status, P&L, holding period
- **Performance vs Index**: Compare recommendation performance to benchmark

### Integration with SimulatorPage

The Simulator page now:
- Shows INITIATE recommendations
- Auto-tracks positions when synced
- Displays stance changes (INITIATE → AVOID)

## Holding Period / Timeframe

Each recommendation includes a **suggested holding period** (default: 30 days).

```json
{
  "suggested_holding_days": 30,
  "expected_holding_days": 30
}
```

When a position exceeds 1.5x the suggested period, it enters `REVIEW` status.

## How It Works

### Daily Refresh Pipeline

1. **Market Data Update**: Load latest prices
2. **Intelligence Pipeline**: Generate new recommendations
3. **Position Sync**: Compare current stance to entry stance
4. **Exit Detection**: Generate EXIT signals for INITIATE → AVOID transitions
5. **Timeline Snapshot**: Save daily recommendations for history

### Position Tracking Flow

```
Day 1: AAPL = INITIATE (Conviction 75%)
        → Position tracked: entry_date=Day1, entry_price=$250

Day 5: AAPL = HOLD (Conviction 70%)
        → Status: HOLD, days_held=5, pnl=+2%

Day 10: AAPL = AVOID (Conviction 55%)
        → Status: EXIT_SIGNAL, exit_reason="Stance changed to AVOID"
        → User sees EXIT alert on Positions page
```

## Data Storage

### Active Positions File
`public/positions/active_positions.json`

```json
{
  "US": {
    "AAPL": {
      "ticker": "AAPL",
      "market": "US",
      "entry_date": "2025-12-20",
      "entry_price": 250.50,
      "entry_conviction": 72.5,
      "tracked_at": "2025-12-20T10:30:00"
    }
  },
  "IN": {
    "RELIANCE.NS": { ... }
  }
}
```

### Timeline Files
`public/timeline/{market}/{date}.json`

Daily snapshots of all recommendations for historical comparison.

## Frontend Usage

### Viewing Exit Signals

1. Navigate to `/positions`
2. EXIT signals appear prominently at top
3. Click any position to see full intelligence
4. Use "View Exit Details" for analysis

### Tracking a Position

Positions are auto-tracked when:
- System gives INITIATE signal
- `/api/positions/sync/{market}` is called

Manual tracking:
```
POST /api/positions/track/US/AAPL
```

## Success Criteria

A user should be able to:

1. ✅ See EXIT signals prominently displayed
2. ✅ Understand why exit is recommended (stance changed)
3. ✅ See how long they've held the position
4. ✅ Compare their performance vs index
5. ✅ Navigate to full intelligence for detailed analysis
6. ✅ Track when they acted on INITIATE
7. ✅ Never feel like this is a trading app

## Important Notes

- **NOT Paper Trading**: No fake capital, no quantities
- **Recommendation Memory**: Track what was recommended, not what you own
- **Educational**: Helps understand recommendation changes over time
- **No Guarantees**: Past recommendations don't predict future results

## Files Modified

### Backend
- `app/position_tracker_api.py` - New position tracking API
- `app/main.py` - Router registration
- `app/timeline_api.py` - Timeline storage

### Frontend
- `pages/ActivePositionsPage.tsx` - New positions page
- `App.tsx` - Route registration
- `components/Layout/AppSidebar.tsx` - Navigation link

## Cursor Prompt for Further Development

Use this prompt to extend the system:

```
Context: FinVest Position Tracking System

The system tracks "virtual positions" based on INITIATE recommendations:
- When INITIATE is given, track as "open position"
- When stance changes to AVOID, generate EXIT signal
- Track holding period vs suggested timeframe (default 30 days)
- Compare performance vs index (SPY for US, NIFTY for IN)

Key files:
- Backend: FinSight/backend/app/position_tracker_api.py
- Frontend: FinSight/frontend/src/pages/ActivePositionsPage.tsx
- Timeline: FinSight/backend/app/timeline_api.py

Do NOT:
- Add paper trading / fake capital
- Add buy/sell quantities
- Modify backend decision logic

DO:
- Enhance EXIT signal visibility
- Add more performance metrics
- Improve position timeline visualization
- Add email/notification for EXIT signals
```

