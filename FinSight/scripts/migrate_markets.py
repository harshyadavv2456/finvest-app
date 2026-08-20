#!/usr/bin/env python3
"""
Migrate Japan (.T) and Singapore (.SI) tickers from OTHER to JP/SG folders.
This is a one-time migration script.
"""

import shutil
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

# Mapping of suffixes to market folders
SUFFIX_TO_MARKET = {
    ".T": "JP",
    ".SI": "SG",
}

def migrate_tickers():
    other_dir = DATA_DIR / "OTHER"
    
    if not other_dir.exists():
        print("OTHER directory does not exist. Nothing to migrate.")
        return
    
    migrated = {"JP": 0, "SG": 0}
    errors = []
    
    # Get all ticker folders in OTHER
    for ticker_dir in list(other_dir.iterdir()):
        if not ticker_dir.is_dir():
            continue
        
        ticker_name = ticker_dir.name
        
        # Check if it's a Japan or Singapore ticker
        target_market = None
        for suffix, market in SUFFIX_TO_MARKET.items():
            if ticker_name.upper().endswith(suffix):
                target_market = market
                break
        
        if not target_market:
            continue  # Not a JP or SG ticker
        
        # Create target directory
        target_dir = DATA_DIR / target_market
        target_dir.mkdir(parents=True, exist_ok=True)
        
        target_path = target_dir / ticker_name
        
        try:
            # Move the folder
            if target_path.exists():
                print(f"  ⚠️ {ticker_name}: Target already exists, skipping")
                continue
            
            shutil.move(str(ticker_dir), str(target_path))
            
            # Update metadata.json with new market
            metadata_path = target_path / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                metadata["market"] = target_market
                with open(metadata_path, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2)
            
            print(f"  ✅ {ticker_name} → {target_market}/")
            migrated[target_market] += 1
            
        except Exception as e:
            print(f"  ❌ {ticker_name}: Error - {e}")
            errors.append(ticker_name)
    
    print()
    print("=" * 50)
    print("MIGRATION SUMMARY")
    print("=" * 50)
    print(f"  Japan (JP): {migrated['JP']} tickers")
    print(f"  Singapore (SG): {migrated['SG']} tickers")
    print(f"  Errors: {len(errors)}")
    
    if errors:
        print(f"  Failed tickers: {', '.join(errors)}")
    
    print("=" * 50)

if __name__ == "__main__":
    print("=" * 50)
    print("FINSIGHT MARKET MIGRATION")
    print("=" * 50)
    print("Moving Japan (.T) and Singapore (.SI) tickers")
    print("from OTHER/ to JP/ and SG/ folders")
    print("=" * 50)
    print()
    
    migrate_tickers()
    print()
    print("Done! Run screener snapshot rebuild after this.")

