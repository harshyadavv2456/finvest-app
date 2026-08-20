"""Download data from GitHub Releases on startup if data folder is missing."""
import os
import zipfile
import requests
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# GitHub release URL - update this after creating the release
DATA_RELEASE_URL = "https://github.com/harshyadavv2456/FinSight/releases/download/data-v1/finsight-data.zip"

def download_data_from_github():
    """Download and extract data from GitHub Releases."""
    data_dir = Path("/opt/render/project/src/data")
    
    # Check if data already exists
    if data_dir.exists() and any(data_dir.iterdir()):
        logger.info(f"Data directory already exists at {data_dir}")
        return True
    
    # Try alternative locations
    alt_locations = [
        Path("/opt/render/project/src/backend/data"),
        Path("../data"),
        Path("data"),
    ]
    
    for alt_path in alt_locations:
        if alt_path.exists() and any(alt_path.iterdir()):
            logger.info(f"Data found at {alt_path}")
            return True
    
    logger.info("Data not found, attempting to download from GitHub Releases...")
    
    try:
        # Create data directory
        data_dir.parent.mkdir(parents=True, exist_ok=True)
        data_dir.mkdir(exist_ok=True)
        
        # Download zip file
        logger.info(f"Downloading data from {DATA_RELEASE_URL}...")
        response = requests.get(DATA_RELEASE_URL, stream=True, timeout=300)
        response.raise_for_status()
        
        zip_path = data_dir.parent / "finsight-data.zip"
        
        # Save zip file
        with open(zip_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"Downloaded {zip_path.stat().st_size / 1024 / 1024:.2f} MB")
        
        # Extract zip file
        logger.info("Extracting data...")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(data_dir.parent)
        
        # Remove zip file
        zip_path.unlink()
        
        logger.info(f"Data extracted to {data_dir}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to download data: {e}")
        return False

if __name__ == "__main__":
    download_data_from_github()

