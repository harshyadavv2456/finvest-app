"""
Execution Configuration - Paper Mode Control

PHASE 43: Real Deployment & Paper Mode Go-Live

This module controls execution mode for the entire system.

PAPER MODE:
- Orders are recorded as WOULD_HAVE_EXECUTED
- No broker APIs are hit
- All execution logic runs normally

LIVE MODE:
- HARD-DISABLED by default
- Requires explicit override (not available yet)
"""

import os
from dataclasses import dataclass
from typing import Literal

ExecutionMode = Literal["PAPER", "LIVE"]


@dataclass(frozen=True)
class ExecutionConfig:
    """
    Immutable execution configuration.
    
    LIVE_EXECUTION_ENABLED is HARD-DISABLED.
    """
    
    # Current execution mode
    mode: ExecutionMode = "PAPER"
    
    # LIVE execution is HARD-DISABLED
    # This cannot be overridden by environment variables or config
    LIVE_EXECUTION_ENABLED: bool = False
    
    # Paper mode settings
    paper_mode_log_all_trades: bool = True
    paper_mode_simulate_slippage: bool = True
    paper_mode_slippage_bps: int = 10  # 10 basis points
    
    def is_paper_mode(self) -> bool:
        """Check if running in paper mode."""
        return self.mode == "PAPER"
    
    def is_live_mode(self) -> bool:
        """Check if running in live mode. Always False since LIVE is disabled."""
        return self.mode == "LIVE" and self.LIVE_EXECUTION_ENABLED
    
    def can_execute(self) -> bool:
        """
        Check if execution is allowed.
        Paper mode always returns True (for simulation).
        Live mode always returns False (disabled).
        """
        if self.mode == "PAPER":
            return True
        return False  # LIVE is HARD-DISABLED
    
    def validate(self) -> None:
        """
        Validate configuration.
        Raises RuntimeError if configuration is invalid.
        """
        if self.mode == "LIVE" and not self.LIVE_EXECUTION_ENABLED:
            raise RuntimeError(
                "LIVE execution is HARD-DISABLED. "
                "Cannot run in LIVE mode. Use PAPER mode only."
            )


# Global singleton
_config = None


def get_execution_config() -> ExecutionConfig:
    """Get the global execution configuration."""
    global _config
    if _config is None:
        # Check environment variable for mode (PAPER only)
        mode = os.getenv("FINVEST_EXECUTION_MODE", "PAPER").upper()
        if mode not in ("PAPER", "LIVE"):
            mode = "PAPER"
        
        # Force PAPER if LIVE is requested (LIVE is disabled)
        if mode == "LIVE":
            import logging
            logging.warning("LIVE mode requested but HARD-DISABLED. Using PAPER mode.")
            mode = "PAPER"
        
        _config = ExecutionConfig(mode=mode)  # type: ignore
        _config.validate()
    
    return _config


def assert_paper_mode() -> None:
    """
    Assert that we are in paper mode.
    Raises RuntimeError if not in paper mode.
    """
    config = get_execution_config()
    if not config.is_paper_mode():
        raise RuntimeError("Expected PAPER mode but got " + config.mode)


def assert_can_execute() -> None:
    """
    Assert that execution is allowed.
    Raises RuntimeError if execution is not allowed.
    """
    config = get_execution_config()
    if not config.can_execute():
        raise RuntimeError(f"Execution not allowed in {config.mode} mode")

