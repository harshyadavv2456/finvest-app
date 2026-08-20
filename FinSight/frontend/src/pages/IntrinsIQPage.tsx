/**
 * IntrinsIQ - Institutional-Grade Valuation Engine
 * 
 * Company-type-aware intrinsic value analysis with confidence-weighted
 * composite, 3-phase DCF with terminal fade, reverse DCF implied growth,
 * intrinsic range with outlier rejection, and valuation zones.
 */

import { useState } from 'react';
import { 
  Search, Loader2, AlertCircle, Activity, DollarSign, 
  TrendingUp, TrendingDown, Minus, Calculator, Globe, FileText,
  ArrowLeft
} from 'lucide-react';

// API configuration - Use production URL when VITE_API_URL not set
const PRODUCTION_API = 'https://finvest-api-gwkz.onrender.com';
const API_BASE = import.meta.env.VITE_API_URL 
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : PRODUCTION_API;

// Types
interface KeyMetrics {
  peRatio: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  beta: number | null;
  dividendYield: number | null;
  debtToEquity: number | null;
}

interface IntrinsicRange {
  low: number;
  base: number;
  high: number;
}

interface ReverseDCF {
  impliedGrowthRate: number;
  modelGrowthRate: number;
  horizon: number;
  expectationGap?: number;
}

interface AlphaSignals {
  expectationGap: number;
  gapLabel: string;
  mispricingScore: number;
  mispricingLabel: string;
  alphaDirection: string;
}

interface AnalysisResult {
  ticker: string;
  companyName: string;
  currentPrice: number;
  intrinsicValue: number;
  intrinsicRange?: IntrinsicRange;
  marginOfSafety: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  valuationZone?: string;
  valuationConfidence?: number;
  companyType?: string;
  reverseDCF?: ReverseDCF;
  alphaSignals?: AlphaSignals;
  summary: string;
  detailedReport: string;
  keyMetrics: KeyMetrics;
  valuationMethodology: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// API call to backend
async function analyzeStock(ticker: string): Promise<{ analysis: AnalysisResult; sources: GroundingSource[] }> {
  const response = await fetch(`${API_BASE}/api/intrinsiq/analyze/${ticker.toUpperCase()}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Analysis failed' }));
    throw new Error(error.detail || 'Analysis failed');
  }
  
  return response.json();
}

// Valuation Gauge Component
function ValuationGauge({ currentPrice, intrinsicValue }: { currentPrice: number; intrinsicValue: number }) {
  const price = Number(currentPrice) || 0;
  const intrinsic = Number(intrinsicValue) || price * 0.9;
  
  if (price === 0 && intrinsic === 0) {
    return (
      <div className="h-48 w-full flex items-center justify-center">
        <p className="text-zinc-500">Waiting for data...</p>
      </div>
    );
  }
  
  const isUndervalued = price < intrinsic;
  const maxVal = Math.max(price, intrinsic, 10) * 1.2;
  const priceWidth = (price / maxVal) * 100;
  const intrinsicWidth = (intrinsic / maxVal) * 100;

  return (
    <div className="w-full space-y-4">
      {/* Bar Chart */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Current Price</span>
            <span>${price.toFixed(2)}</span>
          </div>
          <div className="h-6 bg-zinc-800 rounded overflow-hidden">
            <div 
              className="h-full bg-white/30 rounded transition-all duration-500"
              style={{ width: `${priceWidth}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Intrinsic Value</span>
            <span>${intrinsic.toFixed(2)}</span>
          </div>
          <div className="h-6 bg-zinc-800 rounded overflow-hidden">
            <div 
              className={`h-full rounded transition-all duration-500 ${isUndervalued ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ width: `${intrinsicWidth}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* Price comparison */}
      <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
        <div className="text-center flex-1">
          <div className="text-xs text-zinc-500 mb-1">Current</div>
          <div className="text-xl font-bold text-white font-mono">${price.toFixed(2)}</div>
        </div>
        <div className="flex-shrink-0 px-4">
          <div className={`text-2xl ${isUndervalued ? 'text-emerald-500' : 'text-red-500'}`}>
            {isUndervalued ? '→' : '←'}
          </div>
        </div>
        <div className="text-center flex-1">
          <div className="text-xs text-zinc-500 mb-1">Intrinsic</div>
          <div className={`text-xl font-bold font-mono ${isUndervalued ? 'text-emerald-500' : 'text-red-500'}`}>
            ${intrinsic.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

// Metric Tile Component
function MetricTile({ label, value, prefix = '', suffix = '', color = 'text-white' }: { 
  label: string; 
  value: string | undefined; 
  prefix?: string; 
  suffix?: string; 
  color?: string;
}) {
  return (
    <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`font-mono font-semibold ${color}`}>
        {value ? `${prefix}${value}${suffix}` : 'N/A'}
      </div>
    </div>
  );
}

// Analysis Result View
function AnalysisResultView({ data, sources, onBack }: { 
  data: AnalysisResult; 
  sources: GroundingSource[];
  onBack: () => void;
}) {
  const marginOfSafety = Number(data.marginOfSafety) || 0;
  const currentPrice = Number(data.currentPrice) || 0;
  const intrinsicValue = Number(data.intrinsicValue) || 0;
  
  const getRecommendationStyle = () => {
    switch(data.recommendation) {
      case 'BUY':
        return { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-500', icon: TrendingUp };
      case 'SELL':
        return { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-500', icon: TrendingDown };
      default:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500', text: 'text-yellow-500', icon: Minus };
    }
  };
  
  const recStyle = getRecommendationStyle();
  const RecIcon = recStyle.icon;
  const marginColor = marginOfSafety > 0 ? 'text-emerald-500' : 'text-red-500';
  const potentialReturn = ((intrinsicValue - currentPrice) / currentPrice) * 100;
  const range = data.intrinsicRange;
  const confidence = data.valuationConfidence ?? 0;
  const zone = data.valuationZone ?? 'fair_value';
  const zoneLabel: Record<string, { label: string; color: string }> = {
    deep_undervalue: { label: 'Deep Undervalue', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    undervalue: { label: 'Undervalued', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    fair_value: { label: 'Fair Value', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
    overvalue: { label: 'Overvalued', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    extreme_overvalue: { label: 'Extreme Overvalue', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  };
  const zoneInfo = zoneLabel[zone] ?? zoneLabel.fair_value;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back button */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Search
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-bold text-white tracking-tight">{data.ticker}</h2>
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold border flex items-center gap-1.5 ${recStyle.bg} ${recStyle.border} ${recStyle.text}`}>
              <RecIcon className="w-4 h-4" />
              {data.recommendation}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${zoneInfo.color}`}>
              {zoneInfo.label}
            </span>
          </div>
          <p className="text-xl text-zinc-400 mt-1">{data.companyName}</p>
          <div className="flex items-center gap-2 mt-2">
            {data.companyType && (
              <span className="text-xs text-zinc-400 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 capitalize">
                {data.companyType}
              </span>
            )}
            <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              {data.valuationMethodology || 'DCF Analysis'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-zinc-500 mb-1">Market Price</div>
            <div className="text-3xl font-mono font-bold text-white">${currentPrice.toFixed(2)}</div>
          </div>
          <div className="text-center px-4">
            <div className={`text-2xl font-bold ${potentialReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {potentialReturn >= 0 ? '↗' : '↘'}
            </div>
            <div className={`text-sm font-bold ${potentialReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {potentialReturn >= 0 ? '+' : ''}{potentialReturn.toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500 mb-1">Intrinsic Range</div>
            {range ? (
              <div className="text-right">
                <div className="text-3xl font-mono font-bold text-emerald-400">${range.base.toFixed(2)}</div>
                <div className="text-xs text-zinc-500 font-mono mt-0.5">
                  ${range.low.toFixed(0)} — ${range.high.toFixed(0)}
                </div>
              </div>
            ) : (
              <div className="text-3xl font-mono font-bold text-emerald-400">${intrinsicValue.toFixed(2)}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metrics & Gauge */}
        <div className="lg:col-span-1 space-y-6">
          {/* Valuation Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" /> Valuation Check
            </h3>
            <ValuationGauge currentPrice={currentPrice} intrinsicValue={intrinsicValue} />

            {/* Intrinsic Range Visual */}
            {range && (
              <div className="mt-5 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-2">Intrinsic Range</div>
                <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                  {(() => {
                    const minV = Math.min(range.low, currentPrice) * 0.9;
                    const maxV = Math.max(range.high, currentPrice) * 1.1;
                    const span = maxV - minV || 1;
                    const lowPct = ((range.low - minV) / span) * 100;
                    const highPct = ((range.high - minV) / span) * 100;
                    const pricePct = ((currentPrice - minV) / span) * 100;
                    return (
                      <>
                        <div className="absolute h-full bg-emerald-500/20 rounded" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
                        <div className="absolute h-full w-0.5 bg-white/70" style={{ left: `${pricePct}%` }} title={`Price: $${currentPrice.toFixed(0)}`} />
                      </>
                    );
                  })()}
                </div>
                <div className="flex justify-between text-xs font-mono mt-1">
                  <span className="text-zinc-500">${range.low.toFixed(0)}</span>
                  <span className="text-emerald-400 font-semibold">${range.base.toFixed(0)}</span>
                  <span className="text-zinc-500">${range.high.toFixed(0)}</span>
                </div>
              </div>
            )}

            {/* Confidence Score */}
            <div className="mt-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-zinc-400">Valuation Confidence</span>
                <span className={`text-lg font-bold ${confidence >= 70 ? 'text-emerald-400' : confidence >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {confidence.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${confidence >= 70 ? 'bg-emerald-500' : confidence >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(confidence, 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                {confidence >= 70 ? 'High data coverage & method agreement' : confidence >= 45 ? 'Moderate — some data gaps' : 'Low — limited data availability'}
              </p>
            </div>

            {/* Reverse DCF — Market-Implied Growth */}
            {data.reverseDCF && (
              <div className="mt-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">Reverse DCF — Market Expectations</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 bg-zinc-900 rounded-lg">
                    <p className="text-xs text-zinc-500 mb-0.5">Market Implies</p>
                    <p className={`text-xl font-bold font-mono ${data.reverseDCF.impliedGrowthRate > data.reverseDCF.modelGrowthRate ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {data.reverseDCF.impliedGrowthRate}%
                    </p>
                    <p className="text-xs text-zinc-600">growth / yr</p>
                  </div>
                  <div className="text-center p-2 bg-zinc-900 rounded-lg">
                    <p className="text-xs text-zinc-500 mb-0.5">Model Assumes</p>
                    <p className="text-xl font-bold font-mono text-blue-400">
                      {data.reverseDCF.modelGrowthRate}%
                    </p>
                    <p className="text-xs text-zinc-600">{data.reverseDCF.horizon}yr horizon</p>
                  </div>
                </div>
                {(() => {
                  const diff = data.reverseDCF!.impliedGrowthRate - data.reverseDCF!.modelGrowthRate;
                  const absDiff = Math.abs(diff);
                  if (absDiff < 3) return <p className="text-xs text-zinc-500 mt-2">Market pricing aligns closely with fundamentals.</p>;
                  if (diff > 0) return <p className="text-xs text-amber-400/80 mt-2">Market expects {absDiff.toFixed(1)}% higher growth than our model — pricing in optimism.</p>;
                  return <p className="text-xs text-emerald-400/80 mt-2">Market expects {absDiff.toFixed(1)}% lower growth than our model — potential upside.</p>;
                })()}
              </div>
            )}

            {/* Margin of Safety */}
            <div className="mt-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-zinc-400">Margin of Safety</span>
                <span className={`text-lg font-bold ${marginColor}`}>{marginOfSafety.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${marginOfSafety > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                  style={{ width: `${Math.min(Math.abs(marginOfSafety), 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                {marginOfSafety > 30 ? "Deep undervalue. Strong buying opportunity." : marginOfSafety > 10 ? "Undervalued. Good margin of safety." : marginOfSafety > -10 ? "Fair value zone. Appropriately priced." : marginOfSafety > -30 ? "Overvalued. Limited upside." : "Extreme overvalue. Significant downside risk."}
              </p>
            </div>
          </div>

          {/* Alpha Signals Panel */}
          {data.alphaSignals && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" /> Alpha Signals
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Expectation Gap */}
                <div className="p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Expectation Gap</p>
                  <p className={`text-3xl font-bold font-mono ${
                    data.alphaSignals.expectationGap > 5 ? 'text-emerald-400' : 
                    data.alphaSignals.expectationGap < -10 ? 'text-red-400' : 'text-zinc-300'
                  }`}>
                    {data.alphaSignals.expectationGap > 0 ? '+' : ''}{data.alphaSignals.expectationGap}%
                  </p>
                  <p className={`text-xs mt-1 capitalize ${
                    data.alphaSignals.gapLabel === 'strong_undervalue' ? 'text-emerald-400' :
                    data.alphaSignals.gapLabel === 'undervalue' ? 'text-emerald-400/70' :
                    data.alphaSignals.gapLabel === 'fairly_priced' ? 'text-zinc-400' :
                    data.alphaSignals.gapLabel === 'overvalue' ? 'text-amber-400' :
                    'text-red-400'
                  }`}>{data.alphaSignals.gapLabel?.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-zinc-600 mt-1">Model growth vs market implied</p>
                </div>

                {/* Mispricing Score */}
                <div className="p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Mispricing Probability</p>
                  <p className={`text-3xl font-bold font-mono ${
                    data.alphaSignals.mispricingScore >= 75 ? 'text-purple-400' :
                    data.alphaSignals.mispricingScore >= 50 ? 'text-amber-400' :
                    data.alphaSignals.mispricingScore >= 30 ? 'text-zinc-300' : 'text-zinc-500'
                  }`}>
                    {data.alphaSignals.mispricingScore}%
                  </p>
                  <p className={`text-xs mt-1 capitalize ${
                    data.alphaSignals.mispricingLabel === 'high' ? 'text-purple-400' :
                    data.alphaSignals.mispricingLabel === 'moderate' ? 'text-amber-400' :
                    'text-zinc-500'
                  }`}>{data.alphaSignals.mispricingLabel} probability</p>
                  <p className="text-xs text-zinc-600 mt-1">MOS + gap + confidence</p>
                </div>

                {/* Alpha Direction */}
                <div className="p-4 bg-zinc-950/60 rounded-lg border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500 mb-1">Alpha Direction</p>
                  <div className={`text-3xl font-bold mt-1 ${
                    data.alphaSignals.alphaDirection === 'undervalued' ? 'text-emerald-400' :
                    data.alphaSignals.alphaDirection === 'overvalued' ? 'text-red-400' :
                    'text-zinc-400'
                  }`}>
                    {data.alphaSignals.alphaDirection === 'undervalued' ? '↑' :
                     data.alphaSignals.alphaDirection === 'overvalued' ? '↓' : '↔'}
                  </div>
                  <p className={`text-sm font-semibold capitalize ${
                    data.alphaSignals.alphaDirection === 'undervalued' ? 'text-emerald-400' :
                    data.alphaSignals.alphaDirection === 'overvalued' ? 'text-red-400' :
                    'text-zinc-400'
                  }`}>{data.alphaSignals.alphaDirection}</p>
                  <p className="text-xs text-zinc-600 mt-1">MOS and gap agree</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 mt-3 text-center">
                {data.alphaSignals.mispricingScore >= 60 && data.alphaSignals.alphaDirection === 'undervalued'
                  ? 'Strong alpha signal — both valuation and market expectations suggest mispricing.'
                  : data.alphaSignals.mispricingScore >= 60 && data.alphaSignals.alphaDirection === 'overvalued'
                  ? 'Caution — both MOS and expectation gap flag overpricing risk.'
                  : data.alphaSignals.alphaDirection === 'mixed'
                  ? 'Mixed signals — MOS and expectation gap disagree. Lower conviction.'
                  : 'Signals within normal range. No strong mispricing detected.'
                }
              </p>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" /> Key Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <MetricTile label="P/E Ratio" value={data.keyMetrics.peRatio?.toFixed(2)} />
              <MetricTile label="EPS (TTM)" value={data.keyMetrics.eps?.toFixed(2)} prefix="$" />
              <MetricTile 
                label="Rev Growth" 
                value={data.keyMetrics.revenueGrowth?.toFixed(2)} 
                suffix="%" 
                color={data.keyMetrics.revenueGrowth && data.keyMetrics.revenueGrowth > 0 ? 'text-emerald-400' : 'text-red-400'} 
              />
              <MetricTile label="Beta" value={data.keyMetrics.beta?.toFixed(2)} />
              <MetricTile label="Div Yield" value={data.keyMetrics.dividendYield?.toFixed(2)} suffix="%" />
              <MetricTile label="Debt/Equity" value={data.keyMetrics.debtToEquity?.toFixed(2)} />
            </div>
          </div>
        </div>

        {/* Right Column: Report */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 min-h-[600px]">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-zinc-800">
              <FileText className="w-5 h-5 text-emerald-500" />
              <h3 className="text-xl font-semibold text-white">Analysis Report</h3>
              <span className="ml-auto text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                {data.valuationMethodology}
              </span>
            </div>
            
            {/* Executive Summary */}
            <div className="mb-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <h4 className="text-emerald-400 font-bold mb-2">Executive Summary</h4>
              <p className="text-sm text-zinc-300 leading-relaxed">{data.summary}</p>
            </div>
            
            {/* Detailed Report */}
            <div className="prose prose-invert max-w-none prose-headings:text-emerald-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-white">
              <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                {data.detailedReport}
              </div>
            </div>

            {/* Sources */}
            {sources.length > 0 && (
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <h4 className="text-sm font-semibold text-zinc-500 flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4" /> Sources & Grounding
                </h4>
                <div className="flex flex-wrap gap-2">
                  {sources.map((source, i) => (
                    <a 
                      key={i} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 px-3 py-1 rounded-full transition-colors"
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
}

// Main Page Component
export default function IntrinsIQPage() {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [data, setData] = useState<{ analysis: AnalysisResult; sources: GroundingSource[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const handleSearch = async (ticker: string) => {
    setState(AppState.ANALYZING);
    setError(null);
    setData(null);

    try {
      const result = await analyzeStock(ticker);
      setData(result);
      setState(AppState.SUCCESS);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setState(AppState.ERROR);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      handleSearch(input.trim());
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Calculator className="w-8 h-8 text-emerald-500" />
            IntrinsIQ
          </h1>
          <p className="text-zinc-400 mt-1">AI-powered intrinsic value analysis</p>
        </div>

        {/* IDLE State - Search */}
        {state === AppState.IDLE && (
          <div className="animate-in fade-in duration-500">
            <div className="max-w-2xl mx-auto my-16 text-center space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
                Smarter Analysis. <br/>
                <span className="text-emerald-500">Better Trades.</span>
              </h2>
              <p className="text-zinc-400 text-lg max-w-lg mx-auto">
                Get instant, AI-powered intrinsic value reports for any public company using real-time financial data.
              </p>
              
              <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-xl opacity-30 group-hover:opacity-60 blur transition duration-500"></div>
                <div className="relative flex items-center bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden">
                  <Search className="w-6 h-6 ml-4 text-zinc-500" />
                  <input
                    type="text"
                    className="w-full bg-transparent border-none py-4 px-4 text-lg text-white placeholder-zinc-500 focus:ring-0 focus:outline-none"
                    placeholder="Enter symbol (e.g., AAPL, TSLA, MSFT)..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="mr-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
                  >
                    Analyze
                  </button>
                </div>
              </form>
              
              <div className="flex gap-3 justify-center text-sm text-zinc-500">
                <span>Trending:</span>
                <button onClick={() => handleSearch("NVDA")} className="hover:text-emerald-400 hover:underline">NVDA</button>
                <button onClick={() => handleSearch("AMD")} className="hover:text-emerald-400 hover:underline">AMD</button>
                <button onClick={() => handleSearch("PLTR")} className="hover:text-emerald-400 hover:underline">PLTR</button>
                <button onClick={() => handleSearch("COIN")} className="hover:text-emerald-400 hover:underline">COIN</button>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
              <FeatureCard 
                title="Expectation Gap Engine" 
                desc="Your strongest alpha signal. Compares model growth vs market-implied growth. Reveals when market expectations diverge from fundamentals." 
              />
              <FeatureCard 
                title="Mispricing Probability" 
                desc="Combines MOS, expectation gap, and confidence into a single decision score. Know the probability a stock is truly mispriced." 
              />
              <FeatureCard 
                title="3-Phase DCF with Fade" 
                desc="High growth → transition → terminal fade. Realistic excess-return decay with reverse DCF to decode market expectations." 
              />
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
              <FeatureCard 
                title="Confidence-Weighted Composite" 
                desc="Only applicable methods contribute. Growth stocks skip Graham. Value stocks skip DDM. Each weighted by data confidence." 
              />
              <FeatureCard 
                title="Intrinsic Range & Zones" 
                desc="Low-Base-High range with outlier rejection, five valuation zones, and scenario-weighted DCF for optionality companies." 
              />
              <FeatureCard 
                title="Alpha Tracking Dataset" 
                desc="Every analysis logged with expectation gaps, mispricing scores, and growth assumptions. Builds proprietary edge over time." 
              />
            </div>
          </div>
        )}

        {/* ANALYZING State */}
        {state === AppState.ANALYZING && (
          <div className="min-h-[60vh] flex flex-col justify-center items-center space-y-6 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 animate-pulse"></div>
              <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-white">Analyzing Market Data...</h2>
              <p className="text-zinc-400">Reading financials, calculating DCF, running AI analysis...</p>
              <p className="text-xs text-zinc-600 font-mono pt-4">This usually takes about 10-15 seconds.</p>
            </div>
          </div>
        )}

        {/* ERROR State */}
        {state === AppState.ERROR && (
          <div className="min-h-[60vh] flex flex-col justify-center items-center">
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-8 max-w-md text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Analysis Failed</h3>
              <p className="text-red-200 mb-6">{error}</p>
              <button 
                onClick={() => setState(AppState.IDLE)}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS State */}
        {state === AppState.SUCCESS && data && (
          <AnalysisResultView 
            data={data.analysis} 
            sources={data.sources}
            onBack={() => setState(AppState.IDLE)}
          />
        )}
      </div>
    </div>
  );
}

// Feature Card Component
function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 transition-colors">
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-400">{desc}</p>
    </div>
  );
}

