# StrataX Data Flow Documentation

## Overview

This document explains how StrataX fetches and processes option chain data, and how to control the data source.

## Data Flow (Plain English)

### Frontend → Backend Flow

1. **Frontend Hook**: `useStrataXOptionChain` (in `frontend/src/features/stratax/hooks/useStrataXOptionChain.ts`)
   - Called when user selects an underlying (e.g., NIFTY, BANKNIFTY)
   - Uses `getOptionChainProvider()` to get the data provider

2. **Data Provider**: `LiveOptionChainProvider` (in `frontend/src/features/stratax/data/strataxDataProvider.ts`)
   - Makes HTTP request to backend API endpoint

3. **API Endpoint**: `GET /api/stratax/option-chain?underlying=NIFTY&expiry=2024-01-25`
   - Handled by `get_option_chain()` route in `backend/app/stratax/routes.py`

4. **Backend Route**: `get_option_chain()` function
   - Calls `fetch_option_chain()` (aliased from `get_option_chain()` in `data_provider.py`)

5. **Data Provider**: `get_option_chain()` in `backend/app/stratax/data_provider.py`
   - **SINGLE DECISION POINT**: Reads `STRATAX_DATA_SOURCE` from config
   - If `"mock"` → calls `generate_mock_option_chain()`
   - If `"nse"` → calls `fetch_nse_option_chain()` from `nse_fetcher.py`

6. **NSE Fetcher**: `fetch_nse_option_chain()` in `backend/app/stratax/nse_fetcher.py`
   - Makes HTTP request to NSE API
   - Parses response with `parse_nse_option_chain()`
   - Returns normalized option chain data

### Summary Flow Diagram

```
Frontend
  ↓
useStrataXOptionChain hook
  ↓
LiveOptionChainProvider.getOptionChain()
  ↓
GET /api/stratax/option-chain?underlying=NIFTY
  ↓
Backend: routes.py → get_option_chain()
  ↓
Backend: data_provider.py → get_option_chain()
  ↓
[CONFIG CHECK: STRATAX_DATA_SOURCE]
  ├─ "mock" → generate_mock_option_chain()
  └─ "nse" → nse_fetcher.py → fetch_nse_option_chain()
              ↓
              parse_nse_option_chain()
              ↓
              Return normalized data
```

## Configuration

### Environment Variable

**Variable**: `STRATAX_DATA_SOURCE`

**Allowed Values**:
- `"mock"` - Use mock data (default)
- `"nse"` - Use real-time NSE data

**Default**: `"mock"` (if not set or invalid)

### How to Switch Data Sources

#### Option 1: Environment Variable (Recommended)

**Windows (PowerShell)**:
```powershell
$env:STRATAX_DATA_SOURCE="nse"
# Then start backend
```

**Windows (Command Prompt)**:
```cmd
set STRATAX_DATA_SOURCE=nse
# Then start backend
```

**Linux/Mac**:
```bash
export STRATAX_DATA_SOURCE=nse
# Then start backend
```

#### Option 2: .env File

Create or edit `.env` file in `backend/` directory:
```
STRATAX_DATA_SOURCE=nse
```

Then restart the backend server.

#### Option 3: System Environment (Permanent)

Set the environment variable in your system settings, then restart the backend.

### Verification

After setting the environment variable and restarting the backend:

1. Check the backend logs - you should see:
   ```
   INFO: StrataX data source configured: nse
   ```

2. Call the status endpoint:
   ```bash
   curl http://localhost:8000/api/stratax/data-status
   ```

3. Check the frontend - the data source indicator in the top-right of StrataX page should show:
   - "Live (NSE)" if using NSE successfully
   - "Mock Data" if using mock

## Data Status Endpoint

### Endpoint

`GET /api/stratax/data-status`

### Response Format

```json
{
  "active_source": "nse",
  "fallback_used_recently": false,
  "last_successful_nse_fetch": "2024-01-15T10:30:45.123456",
  "nse_available": true
}
```

### Field Descriptions

- **active_source**: Current data source (`"mock"` or `"nse"`)
- **fallback_used_recently**: `true` if NSE failed and mock was used (not applicable in current implementation - NSE errors are returned directly)
- **last_successful_nse_fetch**: ISO timestamp of last successful NSE fetch, or `null` if never successful
- **nse_available**: `true` if NSE fetcher module is available (import successful)

### Example Response (Mock)

```json
{
  "active_source": "mock",
  "fallback_used_recently": false,
  "last_successful_nse_fetch": null,
  "nse_available": true
}
```

### Example Response (NSE)

```json
{
  "active_source": "nse",
  "fallback_used_recently": false,
  "last_successful_nse_fetch": "2024-01-15T10:30:45.123456",
  "nse_available": true
}
```

## NSE Fetcher Details

### Features

1. **Session Management**: Maintains cookies to avoid blocking
2. **Request Headers**: Mimics browser to avoid 403 errors
3. **Caching**: 8-second cache window to reduce load
4. **Error Handling**: Custom `NSEDataError` exception for clear error messages
5. **Normalization**: Converts NSE format to StrataX format

### Supported Underlyings

Currently supported indices:
- `NIFTY`
- `BANKNIFTY`
- `FINNIFTY`
- `MIDCPNIFTY`

### Limitations & Caveats

1. **Rate Limiting**: NSE may rate-limit requests if too many are made quickly
   - **Solution**: 8-second cache reduces redundant requests

2. **403 Errors**: NSE may block requests that look like bots
   - **Solution**: Headers mimic browser, session cookies help
   - **If persistent**: May need to use VPN or different IP

3. **Network Issues**: Connection timeouts or failures
   - **Solution**: 15-second timeout, clear error messages
   - **Fallback**: Currently returns error (no automatic mock fallback)

4. **Data Format Changes**: NSE may change their API format
   - **Solution**: `parse_nse_option_chain()` handles parsing, errors will be logged

5. **Market Hours**: NSE data only available during market hours
   - **Solution**: Outside market hours, requests will fail with clear error

### Error Handling

If NSE fetch fails:
- `NSEDataError` is raised with descriptive message
- Backend returns HTTP 503 (Service Unavailable) with error details
- Frontend displays error message to user
- **No automatic fallback to mock** (by design - user explicitly requested NSE)

## Data Fetching Script

### Location

`backend/scripts/fetch_stratax_data.py`

### Purpose

Fetches option chain data from NSE and saves it to a JSON file for later use or inspection.

### Usage

```bash
# Fetch current expiry for NIFTY
python backend/scripts/fetch_stratax_data.py NIFTY

# Fetch specific expiry
python backend/scripts/fetch_stratax_data.py BANKNIFTY 2024-01-25
```

### Output

Data is saved to: `data/stratax_cache/[UNDERLYING]_[EXPIRY].json`

Example: `data/stratax_cache/NIFTY_2024_01_25.json`

### Use Cases

1. **Testing**: Fetch sample data to test parsing logic
2. **Debugging**: Inspect raw NSE response format
3. **Offline Development**: Use saved data when NSE is unavailable
4. **Data Analysis**: Analyze historical option chain snapshots

## File Structure

### Backend Files

```
backend/app/stratax/
├── __init__.py
├── config.py              # Configuration (reads STRATAX_DATA_SOURCE)
├── data_provider.py        # SINGLE ENTRY POINT for data (decides mock vs NSE)
├── nse_fetcher.py         # NSE API client (fetching, parsing, caching)
├── routes.py              # FastAPI endpoints
└── schemas.py             # Pydantic models

backend/scripts/
└── fetch_stratax_data.py  # Standalone script to fetch and save NSE data
```

### Frontend Files

```
frontend/src/features/stratax/
├── hooks/
│   └── useStrataXOptionChain.ts  # Hook that calls backend API
├── data/
│   └── strataxDataProvider.ts   # Frontend data provider (calls backend)
└── components/
    └── StrataXDataStatus.tsx     # UI component showing data source status
```

## Key Design Decisions

1. **Single Configuration Point**: All data source decisions come from `STRATAX_DATA_SOURCE` env var, read in `config.py`

2. **No Automatic Fallback**: If NSE is configured but fails, error is returned (no silent fallback to mock). This ensures user knows when real data is unavailable.

3. **Caching**: 8-second cache in NSE fetcher reduces redundant requests and rate-limit risk.

4. **Clear Error Messages**: `NSEDataError` provides specific error details (timeout, 403, invalid format, etc.)

5. **Status Endpoint**: `/api/stratax/data-status` allows frontend and users to verify current data source.

## Troubleshooting

### NSE Returns 403

- **Cause**: NSE blocked the request
- **Solution**: 
  - Wait a few minutes and retry
  - Check if headers are correct (should mimic browser)
  - Try from different IP/VPN

### NSE Returns Timeout

- **Cause**: Network issue or NSE server slow
- **Solution**: 
  - Check internet connection
  - Increase timeout in `nse_fetcher.py` (currently 15 seconds)

### Data Source Not Changing

- **Cause**: Environment variable not set or backend not restarted
- **Solution**:
  1. Verify env var: `echo $STRATAX_DATA_SOURCE` (Linux/Mac) or `echo %STRATAX_DATA_SOURCE%` (Windows)
  2. Restart backend server
  3. Check backend logs for "StrataX data source configured: ..."

### Frontend Shows Wrong Status

- **Cause**: Frontend cache or status endpoint issue
- **Solution**:
  1. Hard refresh browser (Ctrl+F5)
  2. Check browser console for errors
  3. Verify `/api/stratax/data-status` returns correct values

## Future Enhancements

1. **Database Storage**: Save fetched NSE data to database for historical analysis
2. **Multiple Data Sources**: Support other exchanges or data providers
3. **WebSocket Updates**: Real-time option chain updates via WebSocket
4. **Retry Logic**: Automatic retry with exponential backoff for transient NSE errors
5. **Rate Limit Handling**: Detect rate limits and automatically back off

