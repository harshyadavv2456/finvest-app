"""Configuration settings for FinSight backend."""
import os
import logging
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings."""
    
    # Data paths
    # Handle both local development and Render deployment
    # In Render: rootDir is 'backend/', so repo is cloned to /opt/render/project/src
    # Data folder is at /opt/render/project/src/data (one level up from backend/)
    BASE_DIR: Path = Path(__file__).parent.parent.parent  # backend/app -> backend -> repo root
    DATA_DIR: Path = BASE_DIR / "data"  # Default, will be resolved in __init__
    SCREENER_SNAPSHOT_PATH: Path = BASE_DIR / "data" / "screener.parquet"  # Will be updated in __init__
    SCREENER_SNAPSHOT_PATH: Path = DATA_DIR / "screener.parquet"
    
    # Groq API - MUST be set via environment variable
    # Set GROQ_API_KEY in .env file or environment:
    #   export GROQ_API_KEY="your-key-here"
    #   Or create backend/.env with: GROQ_API_KEY=your-key-here
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.1-8b-instant"  # Free, fast model. Alternative: llama-3.3-70b-versatile (paid)
    
    # API settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    # CORS origins - can be set via environment variable (comma-separated string)
    # Note: pydantic-settings will try to parse as JSON, so we handle it manually
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    
    # Caching
    # Screener cache TTL in seconds. Cache is in-memory and cleared on restart.
    # For production, consider using a persistent cache or screener snapshot.
    SCREENER_CACHE_TTL: int = 300  # 5 minutes
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Resolve data directory path (handle both local dev and Render)
        # Try multiple possible data locations in order of preference
        # First, try to find the repo root by looking for common markers
        repo_root = None
        current_path = Path(__file__).resolve()
        
        # Walk up from backend/app/config.py to find repo root
        # backend/app/config.py -> backend/app -> backend -> repo_root
        for parent in [current_path.parent.parent.parent, current_path.parent.parent.parent.parent]:
            if parent.exists():
                # Check if this looks like repo root (has data/ directory or stock_crawler.py)
                if (parent / "data").exists() or (parent / "stock_crawler.py").exists():
                    repo_root = parent
                    break
        
        # If repo root found, use it; otherwise use BASE_DIR
        if repo_root:
            base_for_data = repo_root
        else:
            base_for_data = self.BASE_DIR
        
        # Explicit paths to check (in order of preference)
        possible_data_dirs = [
            base_for_data / "data",  # Repo root / data (most common)
            Path("C:/Users/HARSH/OneDrive/Desktop/FinSight/data"),  # Explicit Windows path
            Path("C:\\Users\\HARSH\\OneDrive\\Desktop\\FinSight\\data"),  # Explicit Windows path (backslash)
            self.BASE_DIR / "data",  # Fallback: calculated BASE_DIR / data
            Path("/opt/render/project/src/data"),  # Render absolute path
            Path("../data").resolve(),  # Relative path from backend/
        ]
        
        # Find first existing data directory with actual ticker data
        data_dir_found = None
        for data_dir in possible_data_dirs:
            data_dir_resolved = data_dir.resolve() if data_dir.is_absolute() else data_dir
            if data_dir_resolved.exists() and data_dir_resolved.is_dir():
                # Verify it has market subdirectories (not just empty)
                try:
                    has_markets = any((data_dir_resolved / d).is_dir() for d in data_dir_resolved.iterdir() if d.is_dir())
                    if has_markets:
                        data_dir_found = data_dir_resolved
                        logger.info(f"Found data directory with markets: {data_dir_found}")
                        break
                except Exception as e:
                    logger.debug(f"Error checking {data_dir_resolved}: {e}")
                    continue
        
        # Set DATA_DIR (fallback to default if none found)
        if data_dir_found is not None:
            object.__setattr__(self, 'DATA_DIR', data_dir_found)
        else:
            # Last resort: use repo root / data or BASE_DIR / data
            fallback_dir = base_for_data / "data"
            object.__setattr__(self, 'DATA_DIR', fallback_dir)
            logger.warning(f"No data directory with markets found, using fallback: {fallback_dir}")
        
        # Update SCREENER_SNAPSHOT_PATH based on resolved DATA_DIR
        object.__setattr__(self, 'SCREENER_SNAPSHOT_PATH', self.DATA_DIR / "screener.parquet")
        
        # Log the data directory being used
        logger.info(f"Data directory: {self.DATA_DIR} (exists: {self.DATA_DIR.exists()})")
        logger.info(f"Screener snapshot path: {self.SCREENER_SNAPSHOT_PATH}")
        
        # If GROQ_API_KEY is not set, try to get from environment as fallback
        if not self.GROQ_API_KEY:
            self.GROQ_API_KEY = os.getenv("GROQ_API_KEY")
        
        # Also try reading from .env file directly if still not set
        if not self.GROQ_API_KEY:
            env_file_path = Path(__file__).parent.parent / ".env"
            if env_file_path.exists():
                try:
                    with open(env_file_path, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "GROQ_API_KEY" in line:
                                key_value = line.split("=", 1)
                                if len(key_value) == 2:
                                    self.GROQ_API_KEY = key_value[1].strip().strip('"').strip("'")
                                    break
                except Exception as e:
                    logger.warning(f"Failed to read .env file: {e}")
        
        if not self.GROQ_API_KEY or not self.GROQ_API_KEY.strip():
            logger.warning("GROQ_API_KEY not set. Set it in .env or environment variables.")


settings = Settings()

