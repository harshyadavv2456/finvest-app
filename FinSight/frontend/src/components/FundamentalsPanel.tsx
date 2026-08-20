import { FundamentalsResponse, ScreenerRow } from '../lib/api';

interface FundamentalsPanelProps {
  fundamentals: FundamentalsResponse;
  screenerRow: ScreenerRow;
}

export default function FundamentalsPanel({ fundamentals, screenerRow }: FundamentalsPanelProps) {
  const formatNumber = (value: number | undefined): string => {
    if (value === undefined || value === null) return '—';
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return value.toFixed(2);
  };

  const formatPercent = (value: number | undefined): string => {
    if (value === undefined || value === null) return '—';
    return `${value.toFixed(2)}%`;
  };

  const info = fundamentals.info || {};

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Key Fundamentals</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Market Cap</div>
          <div className="text-bloomberg-text font-medium">
            {formatNumber(screenerRow.market_cap)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Current Price</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.current_price ? `$${screenerRow.current_price.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">PE (Trailing)</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.pe_trailing ? screenerRow.pe_trailing.toFixed(2) : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">PE (Forward)</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.pe_forward ? screenerRow.pe_forward.toFixed(2) : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Price to Book</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.pb_ratio ? screenerRow.pb_ratio.toFixed(2) : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">ROE</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.roe)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">ROA</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.roa)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Profit Margin</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.profit_margin)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Debt to Equity</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.debt_to_equity ? screenerRow.debt_to_equity.toFixed(2) : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">Dividend Yield</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.dividend_yield)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">52W High</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.high_52w ? `$${screenerRow.high_52w.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">52W Low</div>
          <div className="text-bloomberg-text font-medium">
            {screenerRow.low_52w ? `$${screenerRow.low_52w.toFixed(2)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">% from 52W High</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.pct_from_52w_high)}
          </div>
        </div>
        <div>
          <div className="text-sm text-bloomberg-text-muted mb-1">% from 52W Low</div>
          <div className="text-bloomberg-text font-medium">
            {formatPercent(screenerRow.pct_from_52w_low)}
          </div>
        </div>
        {info.operatingProfit && (
          <div>
            <div className="text-sm text-bloomberg-text-muted mb-1">Operating Profit</div>
            <div className="text-bloomberg-text font-medium">
              {formatNumber(info.operatingProfit)}
            </div>
          </div>
        )}
        {info.netIncome && (
          <div>
            <div className="text-sm text-bloomberg-text-muted mb-1">Net Profit</div>
            <div className="text-bloomberg-text font-medium">
              {formatNumber(info.netIncome)}
            </div>
          </div>
        )}
        {info.totalRevenue && (
          <div>
            <div className="text-sm text-bloomberg-text-muted mb-1">Sales</div>
            <div className="text-bloomberg-text font-medium">
              {formatNumber(info.totalRevenue)}
            </div>
          </div>
        )}
        {info.grossBlock && (
          <div>
            <div className="text-sm text-bloomberg-text-muted mb-1">Gross Block</div>
            <div className="text-bloomberg-text font-medium">
              {formatNumber(info.grossBlock)}
            </div>
          </div>
        )}
        {info.industryPE && (
          <div>
            <div className="text-sm text-bloomberg-text-muted mb-1">Industry PE</div>
            <div className="text-bloomberg-text font-medium">
              {info.industryPE.toFixed(2)}
            </div>
          </div>
        )}
      </div>
      
      {info.longBusinessSummary && (
        <div className="mt-6 pt-6 border-t border-bloomberg-border">
          <h4 className="text-sm font-semibold text-bloomberg-text-muted uppercase mb-2">About</h4>
          <p className="text-sm text-bloomberg-text leading-relaxed">{info.longBusinessSummary}</p>
        </div>
      )}
    </div>
  );
}

