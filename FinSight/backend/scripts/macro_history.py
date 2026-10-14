"""Long macro history (FRED) -> R2  macro/fred_history.parquet   (long format: series, date, value, freq, lag_days).

`date` is the observation date, NOT the release date. `lag_days` is a conservative publication lag the consumer must add before using a value
as a feature (otherwise it is look-ahead): daily market series 1, monthly releases 45, quarterly 100.
Env: FRED_API_KEY, R2_ENDPOINT_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.   Flag: --dry-run
"""
import io, os, sys, time
import pandas as pd
import requests

SERIES = {  # id: (label, freq, lag_days)
    "DGS10": ("US 10y yield", "D", 1), "DGS2": ("US 2y yield", "D", 1), "T10Y2Y": ("US 10y-2y curve", "D", 1), "T10Y3M": ("US 10y-3m curve", "D", 1),
    "DFF": ("Fed funds effective", "D", 1), "VIXCLS": ("VIX", "D", 1), "BAMLH0A0HYM2": ("US high-yield spread", "D", 1), "BAMLC0A0CM": ("US IG spread", "D", 1),
    "DCOILWTICO": ("WTI crude", "D", 2), "DCOILBRENTEU": ("Brent crude", "D", 2), "DHHNGSP": ("Henry Hub gas", "D", 2),
    "DTWEXBGS": ("Broad dollar index", "D", 2), "DEXINUS": ("INR per USD", "D", 2), "DEXJPUS": ("JPY per USD", "D", 2), "DEXCHUS": ("CNY per USD", "D", 2),
    "DEXUSEU": ("USD per EUR", "D", 2), "DEXUSUK": ("USD per GBP", "D", 2),
    "CPIAUCSL": ("US CPI", "M", 45), "CPILFESL": ("US core CPI", "M", 45), "PCEPILFE": ("US core PCE", "M", 50), "UNRATE": ("US unemployment", "M", 40),
    "PAYEMS": ("US payrolls", "M", 40), "INDPRO": ("US industrial production", "M", 45), "UMCSENT": ("US consumer sentiment", "M", 30),
    "M2SL": ("US M2", "M", 45), "RSAFS": ("US retail sales", "M", 45), "HOUST": ("US housing starts", "M", 45), "ICSA": ("US jobless claims", "W", 7),
    "WALCL": ("Fed balance sheet", "W", 7), "GDPC1": ("US real GDP", "Q", 100),
    "INDCPIALLMINMEI": ("India CPI", "M", 50), "IRLTLT01INM156N": ("India 10y yield", "M", 45), "LRUN64TTCNM156S": ("China unemployment", "M", 60),
    "CPALTT01CNM659N": ("China CPI", "M", 50), "IRLTLT01GBM156N": ("UK 10y yield", "M", 45), "CP0000EZ19M086NEST": ("Euro area HICP", "M", 45),
    "IRLTLT01JPM156N": ("Japan 10y yield", "M", 45), "GOLDPMGBD228NLBM": ("Gold PM fix", "D", 2),
}


def fetch(sid, key):
    for i in range(4):
        r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                         params=dict(series_id=sid, api_key=key, file_type="json", observation_start="1995-01-01"), timeout=30)
        if r.status_code == 200:
            return r.json().get("observations", [])
        if r.status_code in (429, 500, 502, 503):
            time.sleep(3 * (i + 1)); continue
        return None
    return None


def main():
    key = os.environ["FRED_API_KEY"]; dry = "--dry-run" in sys.argv
    rows, missing = [], []
    for sid, (label, freq, lag) in SERIES.items():
        obs = fetch(sid, key)
        if obs is None:
            missing.append(sid); continue
        for o in obs:
            try:
                v = float(o["value"])
            except ValueError:
                continue
            rows.append((sid, o["date"], v, freq, lag))
        time.sleep(0.2)
    df = pd.DataFrame(rows, columns=["series", "date", "value", "freq", "lag_days"])
    df["date"] = pd.to_datetime(df["date"])
    print(f"[macro_history] series ok={df['series'].nunique()}/{len(SERIES)} rows={len(df):,} missing={missing}")
    if df.empty or df["series"].nunique() < len(SERIES) // 2:
        sys.exit("too few series fetched; not overwriting R2")
    if dry:
        return
    import boto3
    s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT_URL"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")
    buf = io.BytesIO(); df.to_parquet(buf, index=False, compression="zstd"); buf.seek(0)
    s3.put_object(Bucket=os.environ["R2_BUCKET_NAME"], Key="macro/fred_history.parquet", Body=buf.getvalue())
    print(f"[macro_history] uploaded {len(buf.getvalue())/1e6:.2f} MB")


if __name__ == "__main__":
    main()
