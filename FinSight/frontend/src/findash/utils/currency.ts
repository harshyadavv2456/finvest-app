// Currency formatting utility
export const formatCurrency = (amount: number, symbol: string): string => {
  const isIndian = symbol.includes('.NS') || symbol.includes('.BO');
  const currencySymbol = isIndian ? '₹' : '$';
  
  // Format with appropriate locale
  if (isIndian) {
    return `${currencySymbol}${amount.toLocaleString('en-IN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  } else {
    return `${currencySymbol}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }
};

export const formatPrice = (price: number, symbol: string): string => {
  return formatCurrency(price, symbol);
};

export const formatLargeNumber = (num: number): string => {
  if (num >= 1e12) {
    return `${(num / 1e12).toFixed(2)}T`;
  } else if (num >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`;
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`;
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`;
  }
  return num.toFixed(2);
};
