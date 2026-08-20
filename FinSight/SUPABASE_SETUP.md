# 🔐 FinSight Authentication Setup Guide

Complete guide to set up Google OAuth + Email verification for FinSight.

---

## Step 1: Add Environment Variables to Vercel

1. Go to **[Vercel Dashboard](https://vercel.com)** → Your FinSight Project → **Settings** → **Environment Variables**

2. Add these TWO variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://mprapjrqrahaxfhxxmfy.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wcmFwanJxcmFoYXhmaHh4bWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDU5NDksImV4cCI6MjA4MDg4MTk0OX0.RyYJQpMMF5E-_bv4_4fHyZGIPho3tThL1oSHeHt2FzI` |

3. Click **Save** for each
4. Go to **Deployments** → Click **⋮** on latest → **Redeploy**

---

## Step 2: Configure Site URLs in Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/auth/url-configuration)
2. Set **Site URL**: `https://finsight.fintaxlife.com`
3. Add these **Redirect URLs** (click "Add URL" for each):
   ```
   https://finsight.fintaxlife.com
   https://finsight.fintaxlife.com/
   https://finsight.fintaxlife.com/auth/callback
   http://localhost:5173
   http://localhost:5173/auth/callback
   ```
4. Click **Save**

---

## Step 3: Set Up Database Tables

1. Go to [SQL Editor](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/sql/new)
2. **Copy & paste this ENTIRE SQL** and click **Run**:

```sql
-- ============================================
-- FINSIGHT AUTH TABLES SETUP
-- Run this ONCE in Supabase SQL Editor
-- ============================================

-- Create profiles table (stores user info)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_activity table (for analytics)
CREATE TABLE IF NOT EXISTS public.user_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (prevents errors on re-run)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own activity" ON public.user_activity;
DROP POLICY IF EXISTS "Users can insert their own activity" ON public.user_activity;

-- Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies for user_activity
CREATE POLICY "Users can view their own activity"
  ON public.user_activity FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
  ON public.user_activity FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to handle new user signup (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, last_login)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_login = NOW(),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO anon, authenticated;
GRANT ALL ON public.user_activity TO anon, authenticated;
```

You should see: **Success. No rows returned**

---

## Step 4: Enable Google OAuth

### 4a. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project OR select an existing one
3. Go to **APIs & Services** → **OAuth consent screen**
   - Select **External**
   - Fill in App name: `FinSight`
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue** through all steps
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth client ID**
6. Select **Web application**
7. Name: `FinSight Web`
8. Add **Authorized JavaScript origins**:
   ```
   https://finsight.fintaxlife.com
   http://localhost:5173
   ```
9. Add **Authorized redirect URIs**:
   ```
   https://mprapjrqrahaxfhxxmfy.supabase.co/auth/v1/callback
   ```
10. Click **Create**
11. **COPY** the **Client ID** and **Client Secret** (you'll need these next!)

### 4b. Configure Google in Supabase

1. Go to [Supabase Auth Providers](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/auth/providers)
2. Find **Google** and click to expand
3. Toggle **Enable Sign in with Google** to ON
4. Paste your **Client ID** (from Google)
5. Paste your **Client Secret** (from Google)
6. Click **Save**

---

## Step 5: Configure Email Settings (for verification emails)

### 5a. Enable Email Confirmation

1. Go to [Supabase Email Provider](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/auth/providers)
2. Click on **Email**
3. Make sure **Enable Email provider** is ON
4. **Enable** "Confirm email" toggle ✅
5. Click **Save**

### 5b. Customize Email Templates (Optional but Recommended)

1. Go to [Email Templates](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/auth/templates)
2. Edit **Confirm signup** template:

**Subject:**
```
Verify your FinSight account
```

**Body:**
```html
<h2>Welcome to FinSight! 🚀</h2>

<p>Hi there,</p>

<p>Thanks for signing up for FinSight - your institutional-grade financial intelligence platform.</p>

<p>Click the button below to verify your email:</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; background: linear-gradient(to right, #3B82F6, #06B6D4); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Verify Email</a></p>

<p>Or copy this link: {{ .ConfirmationURL }}</p>

<p>This link expires in 24 hours.</p>

<p>Best,<br>The FinSight Team</p>
```

3. Edit **Reset password** template similarly
4. Click **Save** for each template

---

## ✅ Setup Complete!

### Test It:

1. Go to `https://finsight.fintaxlife.com/login`
2. Try **Google Sign-In** - should redirect to Google and back
3. Try **Email Sign-Up** - should send verification email

### What Users Will Experience:

1. **Google Login**: Click → Google popup → Instant login ✅
2. **Email Signup**: Enter details → Get email → Click verify link → Login ✅

---

## 🔧 Troubleshooting

### Google login shows "Error 400: redirect_uri_mismatch"
- Make sure the redirect URI in Google Console is EXACTLY:
  `https://mprapjrqrahaxfhxxmfy.supabase.co/auth/v1/callback`

### "Database error saving new user"
- Run the SQL in Step 3 again
- Make sure the trigger was created successfully

### Verification email not received
- Check spam/junk folder
- Verify email provider is enabled in Supabase
- Check Supabase logs: Dashboard → Logs → Auth

### Google login popup blocked
- Users need to allow popups for finsight.fintaxlife.com

---

## 📊 View Your Users

1. Go to [Supabase Users](https://supabase.com/dashboard/project/mprapjrqrahaxfhxxmfy/auth/users)
2. See all registered users, their emails, sign-up dates, and verification status

---

## 🎉 Done!

Your FinSight now has:
- ✅ Google OAuth (one-click login)
- ✅ Email/Password with verification
- ✅ Password reset
- ✅ User profiles & tracking
- ✅ Protected premium features

**Free Tier Limits (more than enough!):**
- 50,000 Monthly Active Users
- 500MB Database
- Unlimited API Requests
