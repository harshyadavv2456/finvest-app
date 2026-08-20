/**
 * FinDash Authority Errors
 * 
 * AUTHORITY: LOCKED
 * Errors are thrown when FinDash data is unavailable.
 * The system must FAIL LOUDLY - never fall back to mock data.
 */

export class FindashError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FindashError';
  }
}

export class FindashOfflineError extends FindashError {
  constructor() {
    super(
      'FINDASH_OFFLINE',
      'FinDash is offline. Cannot fetch market data. Start FinDash on port 3000.',
      { port: 3000, expectedUrl: 'http://localhost:3000' }
    );
    this.name = 'FindashOfflineError';
  }
}

export class StockNotFoundError extends FindashError {
  constructor(symbol: string) {
    super(
      'STOCK_NOT_FOUND',
      `Stock not found: ${symbol}. FinDash could not retrieve data for this symbol.`,
      { symbol }
    );
    this.name = 'StockNotFoundError';
  }
}

export class DataFetchError extends FindashError {
  constructor(symbol: string, reason: string) {
    super(
      'DATA_FETCH_ERROR',
      `Failed to fetch data for ${symbol}: ${reason}`,
      { symbol, reason }
    );
    this.name = 'DataFetchError';
  }
}

export class InvalidDataError extends FindashError {
  constructor(symbol: string, issue: string) {
    super(
      'INVALID_DATA',
      `Invalid data received for ${symbol}: ${issue}. Cannot process.`,
      { symbol, issue }
    );
    this.name = 'InvalidDataError';
  }
}

/**
 * Check if an error is a FindashError
 */
export function isFindashError(error: unknown): error is FindashError {
  return error instanceof FindashError;
}

