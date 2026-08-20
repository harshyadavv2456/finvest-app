"""
================================================================================
DATA SOURCE HEALTH MODULE
================================================================================

Provides structured health tracking for external data sources.

Every external data source (NSE, Yahoo, etc.) MUST resolve into one of these states:
- HEALTHY: Data fetched successfully
- TEMPORARILY_BLOCKED: Source is rate-limiting or blocking (retry later)
- FORMAT_CHANGED: Response structure changed (code update needed)
- PERMANENT_FAILURE: Source is permanently broken

This is MANDATORY for institutional-grade execution integrity.

================================================================================
"""

import json
import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


class DataSourceState(Enum):
    """
    Possible states for an external data source.
    
    These states determine how the pipeline should respond to failures.
    """
    HEALTHY = "healthy"
    TEMPORARILY_BLOCKED = "temporarily_blocked"
    FORMAT_CHANGED = "format_changed"
    PERMANENT_FAILURE = "permanent_failure"


class DataCriticality(Enum):
    """
    Criticality level of a data source.
    
    CORE: Required for pipeline. Failures MUST stop the pipeline.
    AUXILIARY: Optional/supplementary. Failures should be logged but not stop pipeline.
    """
    CORE = "core"
    AUXILIARY = "auxiliary"


@dataclass
class DataSourceHealth:
    """Health report for a single data source."""
    source: str                     # e.g., "NSE", "Yahoo", "FII_DII"
    symbol: str                     # e.g., "NIFTY", "AAPL"
    state: DataSourceState
    attempted_at: str               # ISO format timestamp
    last_success: Optional[str]     # ISO format date of last success
    message: str                    # Human-readable explanation
    criticality: DataCriticality = DataCriticality.AUXILIARY  # Default to AUXILIARY for safety
    retry_count: int = 0            # Number of retries attempted
    response_code: Optional[int] = None  # HTTP response code if applicable
    error_type: Optional[str] = None     # Exception type if applicable
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'source': self.source,
            'symbol': self.symbol,
            'state': self.state.value,
            'criticality': self.criticality.value,
            'attempted_at': self.attempted_at,
            'last_success': self.last_success,
            'message': self.message,
            'retry_count': self.retry_count,
            'response_code': self.response_code,
            'error_type': self.error_type,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DataSourceHealth':
        """Create from dictionary."""
        # Handle criticality with default for backwards compatibility
        criticality_str = data.get('criticality', 'auxiliary')
        try:
            criticality = DataCriticality(criticality_str)
        except ValueError:
            criticality = DataCriticality.AUXILIARY
        
        return cls(
            source=data['source'],
            symbol=data['symbol'],
            state=DataSourceState(data['state']),
            attempted_at=data['attempted_at'],
            last_success=data.get('last_success'),
            message=data['message'],
            criticality=criticality,
            retry_count=data.get('retry_count', 0),
            response_code=data.get('response_code'),
            error_type=data.get('error_type'),
        )
    
    def is_actionable_failure(self) -> bool:
        """
        Returns True if this failure requires code changes or manual intervention.
        
        FORMAT_CHANGED and PERMANENT_FAILURE are actionable.
        TEMPORARILY_BLOCKED is not actionable (just wait).
        """
        return self.state in [DataSourceState.FORMAT_CHANGED, DataSourceState.PERMANENT_FAILURE]
    
    def should_fail_pipeline(self) -> bool:
        """
        Returns True if this failure should cause the pipeline to fail.
        
        Only CORE data sources with FORMAT_CHANGED or PERMANENT_FAILURE should fail.
        AUXILIARY data sources never fail the pipeline - they degrade gracefully.
        """
        if self.criticality == DataCriticality.AUXILIARY:
            return False  # AUXILIARY never fails pipeline
        return self.state in [DataSourceState.FORMAT_CHANGED, DataSourceState.PERMANENT_FAILURE]
    
    def is_degraded(self) -> bool:
        """
        Returns True if this data source is in a degraded state.
        
        Degraded = AUXILIARY + (FORMAT_CHANGED or PERMANENT_FAILURE)
        """
        if self.criticality != DataCriticality.AUXILIARY:
            return False
        return self.state in [DataSourceState.FORMAT_CHANGED, DataSourceState.PERMANENT_FAILURE]


class HealthReportWriter:
    """
    Writes health reports for data sources.
    
    Reports are written to artifacts/health/{source}_health.json
    """
    
    def __init__(self, artifacts_dir: Optional[Path] = None):
        if artifacts_dir is None:
            # Default to project artifacts directory
            self.artifacts_dir = Path(__file__).parent.parent.parent.parent / 'artifacts' / 'health'
        else:
            self.artifacts_dir = artifacts_dir
        
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
    
    def write_health(self, health: DataSourceHealth) -> Path:
        """
        Write health report to JSON file.
        
        Returns the path to the written file.
        """
        filename = f"{health.source.lower()}_{health.symbol.lower()}_health.json"
        filepath = self.artifacts_dir / filename
        
        with open(filepath, 'w') as f:
            json.dump(health.to_dict(), f, indent=2)
        
        logger.info(f"[HEALTH] Wrote {health.source}/{health.symbol} health report: {health.state.value}")
        return filepath
    
    def read_health(self, source: str, symbol: str) -> Optional[DataSourceHealth]:
        """Read health report from JSON file."""
        filename = f"{source.lower()}_{symbol.lower()}_health.json"
        filepath = self.artifacts_dir / filename
        
        if not filepath.exists():
            return None
        
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            return DataSourceHealth.from_dict(data)
        except Exception as e:
            logger.warning(f"[HEALTH] Failed to read health report: {e}")
            return None
    
    def read_all_health(self) -> Dict[str, DataSourceHealth]:
        """Read all health reports."""
        reports = {}
        for filepath in self.artifacts_dir.glob('*_health.json'):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                health = DataSourceHealth.from_dict(data)
                key = f"{health.source}_{health.symbol}"
                reports[key] = health
            except Exception as e:
                logger.warning(f"[HEALTH] Failed to read {filepath}: {e}")
        return reports
    
    def get_last_success_date(self, source: str, symbol: str) -> Optional[str]:
        """Get the last success date for a source/symbol."""
        health = self.read_health(source, symbol)
        return health.last_success if health else None


def create_healthy_report(
    source: str,
    symbol: str,
    message: str = "Data fetched successfully",
    criticality: DataCriticality = DataCriticality.AUXILIARY,
) -> DataSourceHealth:
    """Create a HEALTHY health report."""
    now = datetime.now().isoformat()
    return DataSourceHealth(
        source=source,
        symbol=symbol,
        state=DataSourceState.HEALTHY,
        attempted_at=now,
        last_success=now[:10],  # Just the date
        message=message,
        criticality=criticality,
    )


def create_blocked_report(
    source: str,
    symbol: str,
    message: str,
    criticality: DataCriticality = DataCriticality.AUXILIARY,
    response_code: Optional[int] = None,
    retry_count: int = 0,
    last_success: Optional[str] = None,
) -> DataSourceHealth:
    """Create a TEMPORARILY_BLOCKED health report."""
    return DataSourceHealth(
        source=source,
        symbol=symbol,
        state=DataSourceState.TEMPORARILY_BLOCKED,
        attempted_at=datetime.now().isoformat(),
        last_success=last_success,
        message=message,
        criticality=criticality,
        retry_count=retry_count,
        response_code=response_code,
        error_type="BlockedError",
    )


def create_format_changed_report(
    source: str,
    symbol: str,
    message: str,
    criticality: DataCriticality = DataCriticality.AUXILIARY,
    last_success: Optional[str] = None,
) -> DataSourceHealth:
    """Create a FORMAT_CHANGED health report."""
    return DataSourceHealth(
        source=source,
        symbol=symbol,
        state=DataSourceState.FORMAT_CHANGED,
        attempted_at=datetime.now().isoformat(),
        last_success=last_success,
        message=message,
        criticality=criticality,
        error_type="FormatError",
    )


def create_failure_report(
    source: str,
    symbol: str,
    message: str,
    criticality: DataCriticality = DataCriticality.AUXILIARY,
    error_type: Optional[str] = None,
    last_success: Optional[str] = None,
) -> DataSourceHealth:
    """Create a PERMANENT_FAILURE health report."""
    return DataSourceHealth(
        source=source,
        symbol=symbol,
        state=DataSourceState.PERMANENT_FAILURE,
        attempted_at=datetime.now().isoformat(),
        last_success=last_success,
        message=message,
        criticality=criticality,
        error_type=error_type or "PermanentError",
    )

