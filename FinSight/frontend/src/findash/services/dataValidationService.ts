import type { StockRatios } from '../types';

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates financial ratios for consistency and reasonableness
 */
export const validateRatios = (
  ratios: StockRatios,
  currentPrice: number,
  _symbol: string // Prefix with underscore to indicate intentionally unused
): ValidationResult => {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate P/E Ratio
  if (ratios.peRatio !== null) {
    if (ratios.peRatio < 0) {
      errors.push('P/E ratio cannot be negative');
    } else if (ratios.peRatio > 1000) {
      warnings.push('P/E ratio is unusually high (>1000), data may be incorrect');
    }
    
    // Cross-validate P/E with EPS
    if (ratios.eps && ratios.eps > 0 && ratios.peRatio !== null) {
      const calculatedPE = currentPrice / ratios.eps;
      const peDifference = Math.abs(calculatedPE - ratios.peRatio) / ratios.peRatio;
      if (peDifference > 0.1) {
        warnings.push(`P/E ratio (${ratios.peRatio.toFixed(2)}) doesn't match calculated value (${calculatedPE.toFixed(2)})`);
      }
    }
  }

  // Validate EPS
  if (ratios.eps !== null && ratios.eps !== undefined) {
    if (ratios.eps < 0 && ratios.peRatio !== null && ratios.peRatio > 0) {
      warnings.push('Negative EPS with positive P/E ratio is unusual');
    }
  }

  // Validate Dividend Yield
  if (ratios.dividendYield !== null) {
    if (ratios.dividendYield < 0) {
      errors.push('Dividend yield cannot be negative');
    } else if (ratios.dividendYield > 100) {
      warnings.push('Dividend yield exceeds 100%, data may be incorrect');
    }
  }

  // Validate 52-week high/low
  if (ratios.high52Week && ratios.low52Week) {
    if (ratios.low52Week > ratios.high52Week) {
      errors.push('52-week low is greater than 52-week high');
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
};

export const parseMarketCap = (marketCap: string): number | null => {
  if (marketCap === 'N/A' || !marketCap) return null;
  
  const match = marketCap.match(/^([\d.]+)([TBMK])?$/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  
  if (isNaN(value)) return null;
  
  let multiplier = 1;
  switch (unit) {
    case 'T': multiplier = 1e12; break;
    case 'B': multiplier = 1e9; break;
    case 'M': multiplier = 1e6; break;
    case 'K': multiplier = 1e3; break;
  }
  
  return value * multiplier;
};

