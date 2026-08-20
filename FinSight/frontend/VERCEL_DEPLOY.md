# Deploying FinSight Frontend to Vercel

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Your backend API URL (where your FastAPI backend is hosted)

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

4. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? (Select your account)
   - Link to existing project? **No** (for first deployment)
   - Project name? (Press Enter for default or enter custom name)
   - Directory? **./** (current directory)
   - Override settings? **No**

5. **Set Environment Variables**:
   After deployment, go to your Vercel project dashboard:
   - Navigate to **Settings** → **Environment Variables**
   - Add: `VITE_API_URL` = `https://your-backend-url.com`
     - If backend is on Vercel: `https://your-backend.vercel.app`
     - If backend is on another service: Your backend URL
     - **Important**: Don't include `/api` in the URL, just the base URL
   
6. **Redeploy**:
   After adding environment variables, trigger a new deployment:
   ```bash
   vercel --prod
   ```
   Or redeploy from the Vercel dashboard.

### Option 2: Deploy via GitHub Integration

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project in Vercel**:
   - Go to https://vercel.com/new
   - Click **Import Git Repository**
   - Select your GitHub repository
   - Configure:
     - **Framework Preset**: Vite
     - **Root Directory**: `frontend`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`
     - **Install Command**: `npm install`

3. **Add Environment Variables**:
   - In project settings, go to **Environment Variables**
   - Add: `VITE_API_URL` = `https://your-backend-url.com`

4. **Deploy**:
   - Click **Deploy**
   - Vercel will automatically deploy on every push to your main branch

## Environment Variables

### Required:
- `VITE_API_URL`: Your backend API base URL
  - Example: `https://finsight-backend.vercel.app`
  - Leave empty for local development (uses Vite proxy)
  - **Do NOT include `/api` in the URL**

### Example:
```
VITE_API_URL=https://finsight-backend.vercel.app
```

## Important Notes

1. **Backend CORS**: Make sure your backend allows requests from your Vercel domain
   - Add your Vercel URL to `CORS_ORIGINS` in `backend/app/config.py`
   - Example: `CORS_ORIGINS: ["https://your-app.vercel.app"]`

2. **API Proxy**: In production, the frontend will use the `VITE_API_URL` environment variable
   - In development, it uses the Vite proxy (`/api` → `http://localhost:8000`)

3. **Build Output**: The build creates a `dist` folder which Vercel serves

4. **Custom Domain**: After deployment, you can add a custom domain in Vercel project settings

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure TypeScript compiles without errors
- Check build logs in Vercel dashboard

### API Calls Fail
- Verify `VITE_API_URL` is set correctly
- Check backend CORS settings
- Verify backend is accessible from the internet
- Check browser console for errors

### 404 Errors on Routes
- Ensure `vercel.json` has the rewrite rule for SPA routing
- Check that all routes redirect to `index.html`

## Post-Deployment

After successful deployment:
1. Test the application at your Vercel URL
2. Verify API calls are working
3. Check browser console for any errors
4. Test navigation between pages
5. Verify filters and stock detail pages work

## Continuous Deployment

Vercel automatically deploys:
- Every push to the main branch
- Every pull request (preview deployments)

You can disable auto-deploy in project settings if needed.

