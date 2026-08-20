# StrataX Local Development Setup Guide

## ✅ All Issues Fixed

- ✅ TypeScript compilation errors fixed
- ✅ Backend import errors fixed
- ✅ All linter errors resolved

## Task 1: Exact Commands to Run

### Backend Setup & Run

**Location**: `backend/` directory

**Step 1: Create/Activate Virtual Environment (if not exists)**
```powershell
# From repo root
cd backend

# Create venv (if doesn't exist)
python -m venv venv

# Activate venv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Or if you get execution policy error, use:
.\venv\Scripts\activate.bat
```

**Step 2: Install Dependencies**
```powershell
# Make sure venv is activated (you should see (venv) in prompt)
pip install -r requirements.txt
```

**Step 3: Run Backend Server**
```powershell
# From backend/ directory with venv activated
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Backend will be available at:** `http://localhost:8000`
**API Docs:** `http://localhost:8000/docs`

### Frontend Setup & Run

**Location**: `frontend/` directory

**Step 1: Install Dependencies**
```powershell
# From repo root
cd frontend

# Install dependencies (uses npm)
npm install
```

**Step 2: Run Frontend Dev Server**
```powershell
# From frontend/ directory
npm run dev
```

**Expected Output:**
```
  VITE v5.4.2  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Frontend will be available at:** `http://localhost:5173`

### Configuration

**No additional configuration needed!**

The frontend is already configured to proxy API requests:
- Vite proxy configured in `frontend/vite.config.ts` to proxy `/api` → `http://localhost:8000`
- Backend CORS configured in `backend/app/main.py` to allow `http://localhost:5173`
- No `.env` files needed for local development

## Task 2: Runtime Issues Fixed

### Frontend Fixes Applied:
1. ✅ Fixed TypeScript error in `blackScholes.ts` (variable reassignment issue)
2. ✅ Removed unused imports (`refetch`, `useStrataXStrategy`, `StrataXStrategyBuilder`)
3. ✅ Fixed type mismatches in `StrataXSignals.tsx` (ivRank null/undefined handling)
4. ✅ Removed unused variables (`isITM`, `underlying` parameter)
5. ✅ Fixed type compatibility in `signalsCalculator.ts` (null vs undefined)

### Backend Fixes Applied:
1. ✅ Added missing `Optional` import in `data_provider.py`
2. ✅ Fixed `__init__.py` to properly export routes module

### Verification Commands:

**Frontend Type Check:**
```powershell
cd frontend
npm run build
# Should complete without errors
```

**Backend Import Check:**
```powershell
cd backend
python -c "from app.stratax import routes; print('Import successful')"
# Should print: Import successful
```

## Task 3: StrataX Navigation & Flows

### Navigation Path

1. **Open Frontend**: Navigate to `http://localhost:5173`

2. **Main FinSight Shell**: You'll see:
   - Sidebar on the left with:
     - **Modules Section**:
       - Screener (existing)
       - StrataX (new)
     - Markets section
     - Quick Filters section

3. **Access StrataX**: Click "StrataX" in the sidebar

4. **StrataX Page**: Opens with 4 tabs:
   - **Option Chain** (default)
   - **Strategy Builder**
   - **Paper Trades**
   - **Signals**

### Tab-by-Tab Verification

#### ✅ Option Chain Tab
**Path**: Sidebar → StrataX → Option Chain (default tab)

**What to verify:**
- ✅ Dropdown shows underlyings: NIFTY, BANKNIFTY, RELIANCE, TCS, etc.
- ✅ Expiry dropdown shows next 4 Thursdays
- ✅ Table displays option chain with:
  - Strike column (highlighted for ATM)
  - Call columns: LTP, Change, Volume, OI, OI Change, IV
  - Put columns: LTP, Change, Volume, OI, OI Change, IV
- ✅ Data loads from mock provider (no backend calls needed)
- ✅ No console errors

**Test**: Change underlying dropdown → data updates

#### ✅ Strategy Builder Tab
**Path**: Sidebar → StrataX → Strategy Builder tab

**What to verify:**
- ✅ "Add Leg" button visible
- ✅ Click "Add Leg" → new leg form appears
- ✅ Leg form has fields:
  - Underlying, Expiry, Type (CALL/PUT), Action (BUY/SELL), Strike, Quantity, Entry Price
- ✅ Add 2-3 legs → see:
  - Net Premium calculated
  - Max Profit/Loss calculated
  - Breakeven points shown
- ✅ "Show Greeks" button → toggles Greeks display
- ✅ Payoff chart renders below (Recharts)
- ✅ "Save as Paper Trade" button appears when legs exist
- ✅ No console errors

**Test**: 
1. Add leg: NIFTY, CALL, BUY, Strike 24500, Qty 1, Price 100
2. Add leg: NIFTY, CALL, SELL, Strike 24600, Qty 1, Price 50
3. Verify net premium = -50 (debit)
4. Check payoff chart shows spread profile

#### ✅ Paper Trades Tab
**Path**: Sidebar → StrataX → Paper Trades tab

**What to verify:**
- ✅ "New Paper Trade" button visible
- ✅ If no trades: shows empty state message
- ✅ From Strategy Builder: Click "Save as Paper Trade"
  - Dialog appears
  - Enter name (required)
  - Enter notes (optional)
  - Click "Save"
  - Success message appears
- ✅ Return to Paper Trades tab → saved trade appears in list
- ✅ Trade shows:
  - Name
  - Created timestamp
  - Strategy legs summary
  - Edit/Delete buttons
- ✅ Refresh page → trade persists (localStorage)
- ✅ No console errors

**Test**:
1. Build strategy in Strategy Builder
2. Save as "Test Trade"
3. Go to Paper Trades tab
4. Verify trade appears
5. Refresh page → still there

#### ✅ Signals Tab
**Path**: Sidebar → StrataX → Signals tab

**What to verify:**
- ✅ Underlying and Expiry dropdowns visible
- ✅ Key metrics cards show:
  - Put/Call Ratio (PCR) with color coding
  - IV Rank with color coding
  - Spot Price
- ✅ "Highest OI Strikes" section shows top 5
- ✅ "Highest OI Change" section shows top 5
- ✅ "Support Levels" and "Resistance Levels" sections
- ✅ Data loads from mock provider
- ✅ No console errors

**Test**: Change underlying → signals recalculate

### End-to-End Flow Test

1. **Start Backend**: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
2. **Start Frontend**: `npm run dev` (from frontend/)
3. **Open Browser**: `http://localhost:5173`
4. **Navigate**: Click "StrataX" in sidebar
5. **Option Chain**: Verify data loads
6. **Strategy Builder**: Add 2 legs, verify calculations
7. **Save Paper Trade**: Save strategy, verify persistence
8. **Signals**: Verify insights display

## Summary

### ✅ Exact Commands

**Backend:**
```powershell
cd backend
python -m venv venv  # If venv doesn't exist
.\venv\Scripts\Activate.ps1  # Activate venv
pip install -r requirements.txt  # Install deps
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```powershell
cd frontend
npm install  # If node_modules doesn't exist
npm run dev
```

### ✅ Fixes Applied

1. **TypeScript Errors**: Fixed 10+ compilation errors
2. **Backend Import**: Fixed missing `Optional` import
3. **Type Safety**: Fixed null/undefined handling
4. **Unused Code**: Removed unused imports/variables

### ✅ Configuration

**No manual config needed!**
- Frontend proxy: Already configured in `vite.config.ts`
- Backend CORS: Already configured in `main.py`
- API base URL: Uses proxy in dev, no env var needed

### ✅ Verification Checklist

- [x] Backend starts without errors
- [x] Frontend builds without TypeScript errors
- [x] Frontend dev server starts
- [x] StrataX appears in sidebar
- [x] All 4 tabs render
- [x] Option Chain loads mock data
- [x] Strategy Builder calculates correctly
- [x] Paper Trades save/load from localStorage
- [x] Signals display insights
- [x] No console errors in browser

## Next Steps (Future)

1. **Real Data Integration**: Replace mock provider with live NSE data
2. **Backend Paper Trades**: Migrate from localStorage to backend DB
3. **Authentication**: Add user accounts for paper trades
4. **Performance**: Optimize option chain table rendering
5. **Testing**: Add unit tests for Black-Scholes calculations

