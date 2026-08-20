import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AnalysisResult, GroundingSource } from '../types';
import { ValuationGauge } from './ValuationGauge';
import { Activity, DollarSign, FileText, Globe, TrendingUp, TrendingDown, Minus, Calculator, Shield, AlertTriangle } from 'lucide-react';

interface AnalysisResultViewProps {
  data: AnalysisResult;
  sources: GroundingSource[];
}

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({ data, sources }) => {
  const marginOfSafety = Number(data.marginOfSafety) || 0;
  const currentPrice = Number(data.currentPrice) || 0;
  const intrinsicValue = Number(data.intrinsicValue) || 0;
  
  // Determine recommendation styling
  const getRecommendationStyle = () => {
    switch(data.recommendation) {
      case 'BUY':
        return { bg: 'bg-green-500/10', border: 'border-green-500', text: 'text-green-500', icon: TrendingUp };
      case 'SELL':
        return { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-500', icon: TrendingDown };
      default:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500', text: 'text-yellow-500', icon: Minus };
    }
  };
  
  const recStyle = getRecommendationStyle();
  const RecIcon = recStyle.icon;
  const marginColor = marginOfSafety > 0 ? 'text-brand-500' : 'text-red-500';
  
  // Calculate upside/downside
  const potentialReturn = ((intrinsicValue - currentPrice) / currentPrice) * 100;
  
  // Ensure detailedReport is a string
  const reportContent = typeof data.detailedReport === 'string' 
    ? data.detailedReport 
    : (data.detailedReport ? String(data.detailedReport) : 'Analysis report not available.');
  
  // Ensure summary is a string  
  const summaryContent = typeof data.summary === 'string'
    ? data.summary
    : (data.summary ? String(data.summary) : '');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-dark-border pb-6">
        <div>
          <div className="flex items-center gap-3">
             <h2 className="text-4xl font-bold text-white tracking-tight">{data.ticker}</h2>
             <span className={`px-3 py-1.5 rounded-full text-sm font-bold border flex items-center gap-1.5 ${recStyle.bg} ${recStyle.border} ${recStyle.text}`}>
                <RecIcon className="w-4 h-4" />
                {data.recommendation}
             </span>
          </div>
          <p className="text-xl text-dark-muted mt-1">{data.companyName}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-dark-muted bg-dark-card px-2 py-1 rounded border border-dark-border flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              {data.valuationMethodology || 'DCF Analysis'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
            <div className="text-right">
                <div className="text-xs text-dark-muted mb-1">Market Price</div>
                <div className="text-3xl font-mono font-bold text-white">${currentPrice.toFixed(2)}</div>
            </div>
            <div className="text-center px-4">
                <div className={`text-2xl font-bold ${potentialReturn >= 0 ? 'text-brand-500' : 'text-red-500'}`}>
                  {potentialReturn >= 0 ? '↗' : '↘'}
                </div>
                <div className={`text-sm font-bold ${potentialReturn >= 0 ? 'text-brand-500' : 'text-red-500'}`}>
                  {potentialReturn >= 0 ? '+' : ''}{potentialReturn.toFixed(1)}%
                </div>
            </div>
            <div className="text-right">
                <div className="text-xs text-dark-muted mb-1">Intrinsic Value</div>
                <div className="text-3xl font-mono font-bold text-brand-400">${intrinsicValue.toFixed(2)}</div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metrics & Gauge */}
        <div className="lg:col-span-1 space-y-6">
          {/* Valuation Card */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-brand-500" /> Valuation Check
            </h3>
            <ValuationGauge currentPrice={currentPrice} intrinsicValue={intrinsicValue} />
            <div className="mt-6 p-4 bg-dark-bg/50 rounded-lg border border-dark-border">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-dark-muted">Margin of Safety</span>
                    <span className={`text-lg font-bold ${marginColor}`}>{marginOfSafety.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-dark-border h-2 rounded-full overflow-hidden">
                    <div 
                        className={`h-full rounded-full ${marginOfSafety > 0 ? 'bg-brand-500' : 'bg-red-500'}`} 
                        style={{ width: `${Math.min(Math.abs(marginOfSafety), 100)}%` }}
                    ></div>
                </div>
                <p className="text-xs text-dark-muted mt-2">
                    {marginOfSafety > 20 ? "Excellent margin. High safety." : marginOfSafety > 0 ? "Fair margin. Moderate safety." : "Negative margin. Risk of capital loss."}
                </p>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-brand-500" /> Key Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <MetricTile label="P/E Ratio" value={data.keyMetrics.peRatio?.toFixed(2)} />
                <MetricTile label="EPS (TTM)" value={data.keyMetrics.eps?.toFixed(2)} prefix="$" />
                <MetricTile label="Rev Growth" value={data.keyMetrics.revenueGrowth?.toFixed(2)} suffix="%" color={data.keyMetrics.revenueGrowth && data.keyMetrics.revenueGrowth > 0 ? 'text-green-400' : 'text-red-400'} />
                <MetricTile label="Beta" value={data.keyMetrics.beta?.toFixed(2)} />
                <MetricTile label="Div Yield" value={data.keyMetrics.dividendYield?.toFixed(2)} suffix="%" />
                <MetricTile label="Debt/Equity" value={data.keyMetrics.debtToEquity?.toFixed(2)} />
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Report */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-dark-card border border-dark-border rounded-xl p-8 shadow-lg min-h-[600px]">
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-dark-border">
                    <FileText className="w-5 h-5 text-brand-500" />
                    <h3 className="text-xl font-semibold text-white">Analysis Report</h3>
                    <span className="ml-auto text-xs text-dark-muted bg-dark-bg px-2 py-1 rounded border border-dark-border">
                        {data.valuationMethodology}
                    </span>
                </div>
                
                <div className="prose prose-invert max-w-none prose-headings:text-brand-100 prose-a:text-brand-400 prose-strong:text-white prose-li:text-dark-text text-dark-text">
                    <div className="mb-6 p-4 bg-brand-500/5 border border-brand-500/20 rounded-lg">
                        <h4 className="text-brand-400 font-bold mb-2 !mt-0">Executive Summary</h4>
                        <p className="!mb-0 text-sm leading-relaxed">{summaryContent}</p>
                    </div>
                    <ReactMarkdown>{reportContent}</ReactMarkdown>
                </div>

                {/* Sources Section */}
                {sources.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-dark-border">
                        <h4 className="text-sm font-semibold text-dark-muted flex items-center gap-2 mb-3">
                            <Globe className="w-4 h-4" /> Sources & Grounding
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {sources.map((source, i) => (
                                <a 
                                    key={i} 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-xs bg-dark-bg hover:bg-dark-border border border-dark-border text-brand-400 px-3 py-1 rounded-full transition-colors truncate max-w-[200px]"
                                >
                                    {source.title}
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

const MetricTile = ({ label, value, prefix = '', suffix = '', color = 'text-white' }: { label: string, value: string | undefined, prefix?: string, suffix?: string, color?: string }) => (
    <div className="p-3 bg-dark-bg/50 rounded-lg border border-dark-border/50">
        <div className="text-xs text-dark-muted mb-1">{label}</div>
        <div className={`font-mono font-semibold ${color}`}>
            {value ? `${prefix}${value}${suffix}` : 'N/A'}
        </div>
    </div>
);
