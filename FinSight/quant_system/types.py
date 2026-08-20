"""
FinSight Quant System - Centralized Type Definitions
====================================================

Single source of truth for all typing imports.
Import from here to prevent missing type errors across layers.

Usage in any layer:
    from .types import Dict, List, Tuple, Optional, Any, Union
"""

from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Tuple,
    Type,
    TypeVar,
    Union,
)

# Type aliases for common patterns
JSON = Dict[str, Any]
NumericDict = Dict[str, float]
StringDict = Dict[str, str]
DateStr = str  # ISO format date string

# Generic type variable for flexibility
T = TypeVar('T')

# Export all
__all__ = [
    'Any',
    'Callable',
    'Dict',
    'List',
    'Literal',
    'Optional',
    'Tuple',
    'Type',
    'TypeVar',
    'Union',
    'JSON',
    'NumericDict',
    'StringDict',
    'DateStr',
    'T',
]

