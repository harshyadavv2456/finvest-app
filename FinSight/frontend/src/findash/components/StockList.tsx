import React from 'react';
import { formatCurrency } from '../utils/currency';
import type { Stock } from '../types';

interface StockListProps {
  stocks: Stock[];
  selectedStockSymbol: string;
  onSelectStock: (symbol: string) => void;
  comparisonMode?: boolean;
  selectedForComparison?: string[];
  onToggleComparison?: (symbol: string) => void;
}

const StockListItem: React.FC<{
  stock: Stock;
  isSelected: boolean;
  onSelect: () => void;
  comparisonMode?: boolean;
  isInComparison?: boolean;
  onToggleComparison?: () => void;
}> = ({ stock, isSelected, onSelect, comparisonMode, isInComparison, onToggleComparison }) => {
  const isPositive = stock.change >= 0;
  const priceColor = isPositive ? 'text-green-400' : 'text-red-400';
  const bgColor = isSelected 
    ? 'bg-gray-800 border-l-4 border-green-500 shadow-lg' 
    : 'hover:bg-gray-800/50 border-l-4 border-transparent';

  const handleClick = (e: React.MouseEvent) => {
    if (comparisonMode && onToggleComparison) {
      e.stopPropagation();
      onToggleComparison();
    } else {
      onSelect();
    }
  };

  return (
    <li
      className={`p-2 sm:p-3 md:p-4 cursor-pointer transition-all duration-200 ${bgColor} border-b border-gray-700/30`}
      onClick={handleClick}
      aria-current={isSelected ? 'page' : undefined}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            {comparisonMode && (
              <input
                type="checkbox"
                checked={isInComparison || false}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleComparison?.();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-green-500 focus:ring-green-500 cursor-pointer"
              />
            )}
            <p className="font-bold text-xs sm:text-sm text-white truncate">{stock.symbol}</p>
            {isSelected && !comparisonMode && (
              <span className="text-xs text-green-400 flex-shrink-0">●</span>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-gray-400 truncate">{stock.name}</p>
        </div>
        <div className="text-right ml-2 flex-shrink-0">
          <p className="font-mono font-semibold text-xs sm:text-sm text-white mb-0.5 sm:mb-1">
            {formatCurrency(stock.price, stock.symbol)}
          </p>
          <div className={`font-mono text-[10px] sm:text-xs ${priceColor} flex items-center justify-end gap-0.5 sm:gap-1 flex-wrap`}>
            <span>{isPositive ? '▲' : '▼'}</span>
            <span className="whitespace-nowrap">{isPositive ? '+' : ''}{formatCurrency(Math.abs(stock.change), stock.symbol)}</span>
            <span className="whitespace-nowrap">({isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%)</span>
          </div>
        </div>
      </div>
    </li>
  );
};

const MemoizedStockListItem = React.memo(StockListItem);

const StockList: React.FC<StockListProps> = ({
  stocks,
  selectedStockSymbol,
  onSelectStock,
  comparisonMode = false,
  selectedForComparison = [],
  onToggleComparison,
}) => {
  if (stocks.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400 text-sm">No stocks found</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1117]">
      <ul>
        {stocks.map((stock) => (
          <MemoizedStockListItem
            key={stock.symbol}
            stock={stock}
            isSelected={stock.symbol === selectedStockSymbol}
            onSelect={() => onSelectStock(stock.symbol)}
            comparisonMode={comparisonMode}
            isInComparison={selectedForComparison.includes(stock.symbol)}
            onToggleComparison={() => onToggleComparison?.(stock.symbol)}
          />
        ))}
      </ul>
    </div>
  );
};

export default StockList;
