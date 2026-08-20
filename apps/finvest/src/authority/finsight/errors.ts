/**
 * FinSight Authority Errors
 * 
 * AUTHORITY: LOCKED
 * Errors are thrown when FinSight data is unavailable, stale, or invalid.
 * The system must FAIL LOUDLY - never fall back to mock data.
 */

export class AuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthorityError';
  }
}

export class DataMissingError extends AuthorityError {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(
      'DATA_MISSING',
      `FinSight data missing: ${resource}. Cannot proceed without authoritative data.`,
      details
    );
    this.name = 'DataMissingError';
  }
}

export class DataStaleError extends AuthorityError {
  constructor(resource: string, hoursOld: number, threshold: number) {
    super(
      'DATA_STALE',
      `FinSight data is stale: ${resource} is ${hoursOld.toFixed(1)} hours old (threshold: ${threshold}h). Intelligence may be outdated.`,
      { hoursOld, threshold }
    );
    this.name = 'DataStaleError';
  }
}

export class InvalidMarketError extends AuthorityError {
  constructor(market: string) {
    super(
      'INVALID_MARKET',
      `Invalid market: ${market}. Supported markets: US, IN.`,
      { market, supported: ['US', 'IN'] }
    );
    this.name = 'InvalidMarketError';
  }
}

export class SymbolNotFoundError extends AuthorityError {
  constructor(symbol: string, market: string) {
    super(
      'SYMBOL_NOT_FOUND',
      `Symbol not found in FinSight: ${symbol} (market: ${market}). No intelligence available.`,
      { symbol, market }
    );
    this.name = 'SymbolNotFoundError';
  }
}

export class AuthorityViolationError extends AuthorityError {
  constructor(action: string) {
    super(
      'AUTHORITY_VIOLATION',
      `Authority violation: Attempted to ${action}. FinSight decisions are LOCKED and cannot be modified.`,
      { action }
    );
    this.name = 'AuthorityViolationError';
  }
}

/**
 * Check if an error is an AuthorityError
 */
export function isAuthorityError(error: unknown): error is AuthorityError {
  return error instanceof AuthorityError;
}

