#!/usr/bin/env python3
"""
Deployment Verification Script for FinSight
Tests all critical endpoints after deployment
"""
import requests
import json
import sys
from typing import Dict, Any

# Configuration
BACKEND_URL = "https://finsight-backend-6g5r.onrender.com"
FRONTEND_URL = "https://finsight-sand.vercel.app"

def test_endpoint(name: str, url: str, method: str = "GET", data: Dict = None, expected_keys: list = None) -> bool:
    """Test an API endpoint and return True if successful."""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"URL: {url}")
    print(f"{'='*60}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        else:
            print(f"❌ Unknown method: {method}")
            return False
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Status {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
        
        try:
            result = response.json()
        except:
            print(f"❌ FAILED: Invalid JSON response")
            print(f"Response: {response.text[:200]}")
            return False
        
        # Check for expected keys
        if expected_keys:
            missing = [k for k in expected_keys if k not in result]
            if missing:
                print(f"❌ FAILED: Missing keys: {missing}")
                return False
        
        print(f"✅ SUCCESS")
        print(f"Response keys: {list(result.keys())[:10]}")
        
        # Pretty print for important endpoints
        if name in ["Health Check", "Filter Options"]:
            print(json.dumps(result, indent=2)[:500])
        
        return True
        
    except requests.exceptions.Timeout:
        print(f"❌ FAILED: Request timeout (30s)")
        return False
    except requests.exceptions.ConnectionError:
        print(f"❌ FAILED: Connection error - backend may be down")
        return False
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {str(e)}")
        return False

def main():
    """Run all deployment verification tests."""
    print("="*60)
    print("FinSight Deployment Verification")
    print("="*60)
    
    results = {}
    
    # Test 1: Health Check
    results["health"] = test_endpoint(
        "Health Check",
        f"{BACKEND_URL}/api/health",
        expected_keys=["status", "data_directory_found", "total_tickers"]
    )
    
    # Test 2: Filter Options
    results["filters"] = test_endpoint(
        "Filter Options",
        f"{BACKEND_URL}/api/meta/filters",
        expected_keys=["sectors", "industries"]
    )
    
    # Test 3: Screener with Filters
    results["screener"] = test_endpoint(
        "Screener (Filtered)",
        f"{BACKEND_URL}/api/screener?market=IN&min_pe=5&max_pe=20&min_roe=10&limit=10",
        expected_keys=["rows", "total_count"]
    )
    
    # Test 4: Ticker News
    results["news"] = test_endpoint(
        "Ticker News (RELIANCE.NS)",
        f"{BACKEND_URL}/api/ticker/RELIANCE.NS/news"
    )
    
    # Test 5: AI Insights
    results["ai"] = test_endpoint(
        "AI Insights (AAPL)",
        f"{BACKEND_URL}/api/ticker/AAPL/ai-insights",
        method="POST",
        expected_keys=["summary"]
    )
    
    # Test 6: Quarterly Data
    results["quarterly"] = test_endpoint(
        "Quarterly Data (TCS.NS)",
        f"{BACKEND_URL}/api/ticker/TCS.NS/quarterly",
        expected_keys=["ticker", "quarters"]
    )
    
    # Test 7: Markets Endpoint
    results["markets"] = test_endpoint(
        "Markets",
        f"{BACKEND_URL}/api/markets",
        expected_keys=["IN", "US"]
    )
    
    # Test 8: Ratios Endpoint
    results["ratios"] = test_endpoint(
        "Ratios",
        f"{BACKEND_URL}/api/ratios",
        expected_keys=["ratios"]
    )
    
    # Summary
    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{name:20s}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - DEPLOYMENT VERIFIED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - review above")
        return 1

if __name__ == "__main__":
    sys.exit(main())

