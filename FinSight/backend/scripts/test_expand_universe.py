"""Tests for the append-only universe expansion (run in CI before the weekly job touches tickers.txt)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import expand_universe as X


def test_append_never_changes_existing_bytes(tmp_path):
    p = tmp_path / "t.txt"; original = "﻿ ^NSEI\nSPY\nTCS.NS".encode("utf-8")        # BOM, leading space, no trailing newline: all preserved
    p.write_bytes(original)
    assert X.append_only(p, ["NVDA", "7203.T"]) == 2
    after = p.read_bytes()
    assert after.startswith(original) and after.endswith(b"NVDA\n7203.T\n") and b"TCS.NS\nNVDA" in after


def test_duplicates_and_case_variants_are_not_added_twice(tmp_path):
    p = tmp_path / "t.txt"; p.write_text("AAPL\nTCS.NS\n")
    assert X.append_only(p, ["aapl", "tcs.ns", "MSFT", "msft", "MSFT"]) == 1
    assert p.read_text().splitlines() == ["AAPL", "TCS.NS", "MSFT"]


def test_nothing_to_add_leaves_the_file_untouched(tmp_path):
    p = tmp_path / "t.txt"; p.write_text("AAPL\n"); mtime = p.stat().st_mtime_ns
    assert X.append_only(p, ["AAPL"]) == 0 and p.read_text() == "AAPL\n" and p.stat().st_mtime_ns == mtime


def test_violation_restores_the_original(tmp_path, monkeypatch):
    p = tmp_path / "t.txt"; original = b"AAPL\nMSFT\n"; p.write_bytes(original)
    real = Path.read_bytes
    calls = {"n": 0}
    def evil(self):
        calls["n"] += 1
        return real(self)[1:] if calls["n"] == 2 and self == p else real(self)       # simulate a corrupted write on the verification read
    monkeypatch.setattr(Path, "read_bytes", evil)
    with pytest.raises(RuntimeError): X.append_only(p, ["NVDA"])
    monkeypatch.undo(); assert p.read_bytes() == original


def test_symbol_rules_accept_plain_equities_and_reject_wrappers():
    import re
    ok = lambda m, s: re.match(X.MARKETS[m][2], s) is not None
    assert ok("US", "BRK-B") and ok("US", "NVDA") and not ok("US", "BAC-PL") and not ok("US", "ABC.WS")
    assert ok("IN", "M&M.NS") and ok("UK", "SHEL.L") and ok("HK", "0700.HK") and ok("JP", "7203.T") and ok("CN", "600519.SS") and not ok("CN", "600519")
    assert X.LONDON_IOB.match("0R2V.L") and not X.LONDON_IOB.match("SHEL.L")
    assert X.JUNK_NAME.search("DELTA SDR 1to1") and X.JUNK_NAME.search("NEWMONT CDI 1:1") and not X.JUNK_NAME.search("Spotify Technology S.A.")


def test_total_cap_keeps_the_daily_refresh_inside_its_time_limit():
    assert X.TOTAL_CAP <= 4500                      # ~4 s per ticker x 4,500 = 5 h, the refresh job's limit
