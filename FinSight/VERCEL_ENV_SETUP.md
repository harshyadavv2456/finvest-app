# Vercel Environment Variable Setup

## Critical: Set VITE_API_URL in Vercel

The frontend needs to know where the backend API is located. You **must** set the `VITE_API_URL` environment variable in Vercel.

### Steps to Set Environment Variable:

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your **FinSight** project
3. Go to **Settings** → **Environment Variables**
4. Add a new environment variable:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://finsight-backend-6g5r.onrender.com`
   - **Environment**: Select all (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your application (or wait for the next deployment)

### Why This Is Needed:

- In development, the frontend uses `/api` which is proxied to `http://localhost:8000` via Vite
- In production (Vercel), there's no proxy, so the frontend needs the full backend URL
- Without this variable, API calls will fail with network errors

### Verify It's Working:

After setting the environment variable and redeploying:

1. Open your Vercel app in the browser
2. Open browser DevTools (F12) → Console tab
3. You should see: `API_BASE: https://finsight-backend-6g5r.onrender.com` (in development mode)
4. Check the Network tab to see if API calls are going to the correct URL
5. Data should load successfully

### Current Backend URL:

- **Render Backend**: `https://finsight-backend-6g5r.onrender.com`
- **Custom Domain** (if configured): `https://finsight.fintaxlife.com`

### Troubleshooting:

If data still doesn't load after setting the environment variable:

1. **Check Console Errors**: Look for CORS errors or network errors
2. **Check Network Tab**: Verify requests are going to the correct URL
3. **Verify Backend is Live**: Visit `https://finsight-backend-6g5r.onrender.com/api/health` in your browser
4. **Check CORS**: The backend should allow requests from your Vercel domain

### Additional Notes:

- The `feature_collector.js` and `runtime.lastError` messages are from browser extensions (not our code) - they can be ignored
- The actual data loading issue is likely due to missing `VITE_API_URL` environment variable

