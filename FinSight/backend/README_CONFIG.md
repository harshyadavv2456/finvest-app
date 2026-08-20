# FinSight Backend Configuration

## Environment Variables

### Required

**GROQ_API_KEY** - Groq API key for AI insights
- Get your key from: https://console.groq.com/
- Set in `.env` file or environment:
  ```bash
  export GROQ_API_KEY="your-key-here"
  ```
- Or create `backend/.env`:
  ```
  GROQ_API_KEY=your-key-here
  ```

### Optional

**GROQ_MODEL** - Groq model to use (default: `llama-3.1-70b-versatile`)
```
GROQ_MODEL=llama-3.1-70b-versatile
```

**API_HOST** - Backend host (default: `0.0.0.0`)
```
API_HOST=0.0.0.0
```

**API_PORT** - Backend port (default: `8000`)
```
API_PORT=8000
```

**SCREENER_CACHE_TTL** - Screener cache TTL in seconds (default: `300`)
```
SCREENER_CACHE_TTL=300
```

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your `GROQ_API_KEY`

3. Start the backend:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Notes

- All configuration uses `pydantic-settings` which automatically reads from:
  1. Environment variables
  2. `.env` file in the backend directory
  3. Default values (if defined)

- Never commit `.env` file to version control (it's in `.gitignore`)

