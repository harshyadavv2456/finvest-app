/**
 * Stock Intelligence Component
 * Comprehensive stock analysis leveraging all data sources
 */

import { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Building2, Shield, 
  Target, DollarSign, BarChart3, Activity, AlertTriangle,
  Briefcase, Award, PieChart, Info, HelpCircle
} from 'lucide-react';
import { api } from '../lib/api';

interface StockIntelligenceProps {
  ticker: string;
}

interface ExecutiveInfo {
  name: string;
  title: string;
  age?: number;
  total_pay?: number;
  exercised_value?: number;
  unexercised_value?: number;
}

interface IntelligenceData {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  website: string;
  employees: number;
  business_summary: string;
  current_price: number;
  market_cap: number;
  volume: number;
  avg_volume: number;
  
  valuation: {
    pe_trailing: number;
    pe_forward: number;
    peg_ratio: number;
    price_to_book: number;
    price_to_sales: number;
    ev_to_revenue: number;
    ev_to_ebitda: number;
    market_cap: number;
    enterprise_value: number;
    "52_week_high": number;
    "52_week_low": number;
    all_time_high: number;
    current_price: number;
    distance_from_52w_high: number;
    distance_from_52w_low: number;
    distance_from_ath: number;
  };
  
  growth: {
    revenue_growth: number;
    earnings_growth: number;
    earnings_quarterly_growth: number;
    trailing_eps: number;
    forward_eps: number;
    profit_margins: number;
    gross_margins: number;
    operating_margins: number;
    beta: number;
  };
  
  ownership: {
    insider_percent: number;
    institutional_percent: number;
    float_shares: number;
    shares_outstanding: number;
    shares_short: number;
    short_ratio: number;
    short_percent_of_float: number;
  };
  
  dividends: {
    dividend_rate: number;
    dividend_yield: number;
    payout_ratio: number;
    five_year_avg_yield: number;
  };
  
  analysts: {
    target_high: number;
    target_low: number;
    target_mean: number;
    target_median: number;
    recommendation_mean: number;
    recommendation_key: string;
    number_of_analysts: number;
    upside_potential: number;
  };
  
  governance: {
    audit_risk: number;
    board_risk: number;
    compensation_risk: number;
    shareholder_rights_risk: number;
    overall_risk: number;
    interpretation: string;
  };
  
  executives: ExecutiveInfo[];
  
  insider_sentiment: {
    score: number;
    signal: string;
    recent_buys: number;
    recent_sells: number;
    recent_exercises: number;
    buy_value: number;
    sell_value: number;
    net_value: number;
  };
}

interface InsiderHistoryData {
  trades: Array<{
    date: string;
    owner: string;
    relationship: string;
    transaction_type: string;
    shares: number;
    price: number;
    value: number;
  }>;
  summary: {
    total_trades: number;
    total_buys: number;
    total_sells: number;
    buy_value: number;
    sell_value: number;
    net_value: number;
    top_insiders: Array<{
      name: string;
      total_shares: number;
      total_value: number;
      trade_count: number;
    }>;
  };
}

interface MultiFactorScore {
  technical: number;
  fundamental: number;
  momentum: number;
  value: number;
  overall: number;
  rating: string;
}

// Score explanation data - what factors contribute to each score
interface ScoreExplanation {
  factors: Array<{
    name: string;
    impact: 'positive' | 'negative' | 'neutral';
    points: number;
    reason: string;
  }>;
  methodology: string;
  weight: string;
}

interface PatternData {
  patterns: Array<{
    pattern: string;
    type: string;
    confidence: number;
    description: string;
  }>;
}

export default function StockIntelligence({ ticker }: StockIntelligenceProps) {
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(null);
  const [insiderHistory, setInsiderHistory] = useState<InsiderHistoryData | null>(null);
  const [score, setScore] = useState<MultiFactorScore | null>(null);
  const [patterns, setPatterns] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'insiders' | 'executives' | 'technicals'>('overview');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [intelligenceRes, historyRes, scoreRes, patternsRes] = await Promise.all([
          // Use stock-data endpoint which computes intelligence from existing data
          api.get(`/api/stock-data/stock/${ticker}`).catch(() => null),
          api.get(`/api/stock-data/stock/${ticker}/insider-history?days=365`).catch(() => null),
          api.get(`/api/analytics/score/${ticker}`).catch(() => null),
          api.get(`/api/analytics/patterns/${ticker}`).catch(() => null),
        ]);
        
        if (intelligenceRes?.data) setIntelligence(intelligenceRes.data);
        if (historyRes?.data) setInsiderHistory(historyRes.data);
        if (scoreRes?.data?.scores) setScore(scoreRes.data.scores);
        if (patternsRes?.data) setPatterns(patternsRes.data);
      } catch (err) {
        console.error('Error fetching intelligence:', err);
      } finally {
        setLoading(false);
      }
    };

    if (ticker) {
      fetchData();
    }
  }, [ticker]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-bloomberg-darker rounded w-1/3"></div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-bloomberg-darker rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div className="text-center py-8 text-bloomberg-text-muted">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Intelligence data not available for {ticker}</p>
      </div>
    );
  }

  const formatCurrency = (val: number | null | undefined, compact = false) => {
    if (val === null || val === undefined) return 'N/A';
    if (compact && Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (compact && Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRatingColor = (rating: string) => {
    if (rating.includes('Buy')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (rating.includes('Sell')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  // Generate explanations for each score based on actual data
  const generateScoreExplanations = (): Record<string, ScoreExplanation> => {
    if (!intelligence) return {};

    const explanations: Record<string, ScoreExplanation> = {
      technical: {
        factors: [],
        methodology: 'Technical score evaluates price patterns, momentum indicators, and trend strength using RSI, MACD, and moving averages.',
        weight: '25% of overall score'
      },
      fundamental: {
        factors: [],
        methodology: 'Fundamental score assesses financial health using P/E ratio, profit margins, revenue growth, and analyst recommendations.',
        weight: '35% of overall score'
      },
      momentum: {
        factors: [],
        methodology: 'Momentum score measures recent price performance over 1-week and 1-month periods to gauge market sentiment.',
        weight: '20% of overall score'
      },
      value: {
        factors: [],
        methodology: 'Value score determines if the stock is undervalued using P/B ratio, dividend yield, and 52-week price position.',
        weight: '20% of overall score'
      }
    };

    // Technical factors
    // Note: We don't have real-time RSI/MACD in the frontend data, so we explain based on general methodology

    // Fundamental factors
    const pe = intelligence.valuation?.pe_trailing;
    if (pe) {
      if (pe < 15) {
        explanations.fundamental.factors.push({ name: 'P/E Ratio', impact: 'positive', points: 25, reason: `P/E of ${pe.toFixed(1)} is low (<15), indicating potential undervaluation` });
      } else if (pe < 25) {
        explanations.fundamental.factors.push({ name: 'P/E Ratio', impact: 'positive', points: 15, reason: `P/E of ${pe.toFixed(1)} is reasonable (<25), fair valuation` });
      } else if (pe > 40) {
        explanations.fundamental.factors.push({ name: 'P/E Ratio', impact: 'negative', points: -15, reason: `P/E of ${pe.toFixed(1)} is high (>40), may be overvalued` });
      } else {
        explanations.fundamental.factors.push({ name: 'P/E Ratio', impact: 'neutral', points: 0, reason: `P/E of ${pe.toFixed(1)} is in moderate range` });
      }
    }

    // NOTE: profit_margins, revenue_growth, etc. come from backend ALREADY as percentages (e.g., 22.03 for 22.03%)
    const margins = intelligence.growth?.profit_margins || 0;
    if (margins > 20) {
      explanations.fundamental.factors.push({ name: 'Profit Margin', impact: 'positive', points: 25, reason: `Profit margin of ${margins.toFixed(1)}% is excellent (>20%)` });
    } else if (margins > 10) {
      explanations.fundamental.factors.push({ name: 'Profit Margin', impact: 'positive', points: 15, reason: `Profit margin of ${margins.toFixed(1)}% is good (>10%)` });
    } else if (margins < 0) {
      explanations.fundamental.factors.push({ name: 'Profit Margin', impact: 'negative', points: -20, reason: `Negative profit margin of ${margins.toFixed(1)}%` });
    }

    // NOTE: revenue_growth comes from backend ALREADY as a percentage (e.g., 25.5 for 25.5%)
    const revGrowth = intelligence.growth?.revenue_growth || 0;
    if (revGrowth > 20) {
      explanations.fundamental.factors.push({ name: 'Revenue Growth', impact: 'positive', points: 25, reason: `Revenue growth of ${revGrowth.toFixed(1)}% YoY is strong (>20%)` });
    } else if (revGrowth > 10) {
      explanations.fundamental.factors.push({ name: 'Revenue Growth', impact: 'positive', points: 15, reason: `Revenue growth of ${revGrowth.toFixed(1)}% YoY is healthy (>10%)` });
    } else if (revGrowth < 0) {
      explanations.fundamental.factors.push({ name: 'Revenue Growth', impact: 'negative', points: -15, reason: `Revenue declining by ${Math.abs(revGrowth).toFixed(1)}% YoY` });
    }

    const recMean = intelligence.analysts?.recommendation_mean;
    if (recMean) {
      if (recMean < 2) {
        explanations.fundamental.factors.push({ name: 'Analyst Rating', impact: 'positive', points: 20, reason: `Strong Buy consensus (${recMean.toFixed(1)}/5)` });
      } else if (recMean < 3) {
        explanations.fundamental.factors.push({ name: 'Analyst Rating', impact: 'positive', points: 10, reason: `Buy consensus (${recMean.toFixed(1)}/5)` });
      } else if (recMean > 4) {
        explanations.fundamental.factors.push({ name: 'Analyst Rating', impact: 'negative', points: -15, reason: `Sell consensus (${recMean.toFixed(1)}/5)` });
      }
    }

    // Value factors
    const pb = intelligence.valuation?.price_to_book;
    if (pb) {
      if (pb < 1) {
        explanations.value.factors.push({ name: 'Price-to-Book', impact: 'positive', points: 30, reason: `P/B of ${pb.toFixed(2)} (<1) indicates stock trading below book value` });
      } else if (pb < 3) {
        explanations.value.factors.push({ name: 'Price-to-Book', impact: 'positive', points: 15, reason: `P/B of ${pb.toFixed(2)} is reasonable (<3)` });
      } else if (pb > 10) {
        explanations.value.factors.push({ name: 'Price-to-Book', impact: 'negative', points: -15, reason: `P/B of ${pb.toFixed(2)} is very high (>10)` });
      }
    }

    // NOTE: dividend_yield comes from backend ALREADY as a percentage (e.g., 4.5 for 4.5%)
    const divYield = intelligence.dividends?.dividend_yield || 0;
    if (divYield > 4) {
      explanations.value.factors.push({ name: 'Dividend Yield', impact: 'positive', points: 20, reason: `Dividend yield of ${divYield.toFixed(2)}% is attractive (>4%)` });
    } else if (divYield > 2) {
      explanations.value.factors.push({ name: 'Dividend Yield', impact: 'positive', points: 10, reason: `Dividend yield of ${divYield.toFixed(2)}% is moderate (>2%)` });
    }

    // 52-week position for value
    const distFromHigh = intelligence.valuation?.distance_from_52w_high || 0;
    if (distFromHigh < -30) {
      explanations.value.factors.push({ name: '52-Week Position', impact: 'positive', points: 25, reason: `${Math.abs(distFromHigh).toFixed(1)}% below 52-week high, potential value opportunity` });
    } else if (distFromHigh > -10) {
      explanations.value.factors.push({ name: '52-Week Position', impact: 'negative', points: -15, reason: `Near 52-week high (${distFromHigh.toFixed(1)}%), limited upside` });
    }

    return explanations;
  };

  const scoreExplanations = generateScoreExplanations();

  return (
    <div className="space-y-6">
      {/* Header with Multi-Factor Score */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-bloomberg-text">{intelligence.name}</h2>
          <p className="text-bloomberg-text-muted">
            {intelligence.sector} • {intelligence.industry} • {intelligence.country}
          </p>
        </div>
        
        {score && (
          <div className="text-right">
            <div className={`text-3xl font-bold ${getScoreColor(score.overall)}`}>
              {score.overall.toFixed(0)}/100
            </div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getRatingColor(score.rating)}`}>
              {score.rating}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-bloomberg-border pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: PieChart },
          { id: 'insiders', label: 'Insider Activity', icon: Users },
          { id: 'executives', label: 'Executives', icon: Briefcase },
          { id: 'technicals', label: 'Technicals', icon: Activity },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-bloomberg-accent text-white'
                : 'text-bloomberg-text-muted hover:text-bloomberg-text hover:bg-bloomberg-darker'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Multi-Factor Scores with Explanations */}
          {score && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Technical', key: 'technical', value: score.technical, icon: Activity },
                  { label: 'Fundamental', key: 'fundamental', value: score.fundamental, icon: BarChart3 },
                  { label: 'Momentum', key: 'momentum', value: score.momentum, icon: TrendingUp },
                  { label: 'Value', key: 'value', value: score.value, icon: DollarSign },
                ].map(item => (
                  <ScoreCardWithExplanation
                    key={item.label}
                    label={item.label}
                    scoreKey={item.key}
                    value={item.value}
                    icon={item.icon}
                    explanation={scoreExplanations[item.key]}
                  />
                ))}
              </div>
              
              {/* Overall Score Explanation */}
              <div className="bg-gradient-to-r from-bloomberg-darker to-bloomberg-dark rounded-lg p-4 border border-bloomberg-accent/30">
                <h3 className="text-lg font-semibold text-bloomberg-text mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-bloomberg-accent" />
                  How This Score Was Calculated
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-sm text-bloomberg-text-muted">Technical</div>
                    <div className="text-lg font-bold text-bloomberg-text">{score.technical.toFixed(0)} × 25%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-bloomberg-text-muted">Fundamental</div>
                    <div className="text-lg font-bold text-bloomberg-text">{score.fundamental.toFixed(0)} × 35%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-bloomberg-text-muted">Momentum</div>
                    <div className="text-lg font-bold text-bloomberg-text">{score.momentum.toFixed(0)} × 20%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-bloomberg-text-muted">Value</div>
                    <div className="text-lg font-bold text-bloomberg-text">{score.value.toFixed(0)} × 20%</div>
                  </div>
                </div>
                <div className="text-center pt-3 border-t border-bloomberg-border">
                  <div className="text-sm text-bloomberg-text-muted mb-1">Overall Score</div>
                  <div className={`text-3xl font-bold ${getScoreColor(score.overall)}`}>
                    {score.overall.toFixed(1)}/100
                  </div>
                  <div className="text-xs text-bloomberg-text-muted mt-1">
                    = ({score.technical.toFixed(0)}×0.25) + ({score.fundamental.toFixed(0)}×0.35) + ({score.momentum.toFixed(0)}×0.20) + ({score.value.toFixed(0)}×0.20)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Market Cap"
              value={formatCurrency(intelligence.market_cap, true)}
              icon={Building2}
            />
            <MetricCard
              label="P/E Ratio"
              value={intelligence.valuation.pe_trailing?.toFixed(2) || 'N/A'}
              icon={BarChart3}
            />
            <MetricCard
              label="52W Range"
              value={`${formatCurrency(intelligence.valuation["52_week_low"])} - ${formatCurrency(intelligence.valuation["52_week_high"])}`}
              subValue={`${formatPercent(intelligence.valuation.distance_from_52w_high)} from high`}
              icon={Target}
            />
            <MetricCard
              label="Analyst Target"
              value={formatCurrency(intelligence.analysts.target_mean)}
              subValue={`${formatPercent(intelligence.analysts.upside_potential)} upside`}
              valueColor={intelligence.analysts.upside_potential > 0 ? 'text-green-400' : 'text-red-400'}
              icon={Award}
            />
          </div>

          {/* Valuation & Growth */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-bloomberg-accent" />
                Valuation
              </h3>
              <div className="space-y-3">
                <MetricRow label="P/E (TTM)" value={intelligence.valuation.pe_trailing?.toFixed(2)} />
                <MetricRow label="P/E (Forward)" value={intelligence.valuation.pe_forward?.toFixed(2)} />
                <MetricRow label="PEG Ratio" value={intelligence.valuation.peg_ratio?.toFixed(2)} />
                <MetricRow label="P/B Ratio" value={intelligence.valuation.price_to_book?.toFixed(2)} />
                <MetricRow label="P/S Ratio" value={intelligence.valuation.price_to_sales?.toFixed(2)} />
                <MetricRow label="EV/EBITDA" value={intelligence.valuation.ev_to_ebitda?.toFixed(2)} />
              </div>
            </div>

            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Growth & Margins
              </h3>
              <div className="space-y-3">
                <MetricRow label="Revenue Growth" value={formatPercent(intelligence.growth.revenue_growth)} highlight />
                <MetricRow label="Earnings Growth" value={formatPercent(intelligence.growth.earnings_growth)} highlight />
                <MetricRow label="Profit Margin" value={formatPercent(intelligence.growth.profit_margins)} />
                <MetricRow label="Gross Margin" value={formatPercent(intelligence.growth.gross_margins)} />
                <MetricRow label="Operating Margin" value={formatPercent(intelligence.growth.operating_margins)} />
                <MetricRow label="Beta" value={intelligence.growth.beta?.toFixed(2)} />
              </div>
            </div>
          </div>

          {/* Ownership & Governance */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-bloomberg-accent" />
                Ownership
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-bloomberg-text-muted">Insider</span>
                    <span className="text-bloomberg-text">{intelligence.ownership.insider_percent?.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 bg-bloomberg-dark rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(intelligence.ownership.insider_percent || 0, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-bloomberg-text-muted">Institutional</span>
                    <span className="text-bloomberg-text">{intelligence.ownership.institutional_percent?.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 bg-bloomberg-dark rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(intelligence.ownership.institutional_percent || 0, 100)}%` }} />
                  </div>
                </div>
                <div className="pt-2 border-t border-bloomberg-border">
                  <MetricRow label="Short % of Float" value={formatPercent(intelligence.ownership.short_percent_of_float)} />
                  <MetricRow label="Short Ratio" value={`${intelligence.ownership.short_ratio?.toFixed(2)} days`} />
                </div>
              </div>
            </div>

            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-bloomberg-accent" />
                Governance Risk
              </h3>
              <div className="space-y-3">
                <RiskMeter label="Overall Risk" score={intelligence.governance.overall_risk} />
                <RiskMeter label="Audit Risk" score={intelligence.governance.audit_risk} />
                <RiskMeter label="Board Risk" score={intelligence.governance.board_risk} />
                <RiskMeter label="Compensation Risk" score={intelligence.governance.compensation_risk} />
                <p className="text-sm text-bloomberg-text-muted mt-2 pt-2 border-t border-bloomberg-border">
                  {intelligence.governance.interpretation}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'insiders' && (
        <div className="space-y-6">
          {/* Insider Sentiment Summary */}
          <div className="bg-bloomberg-darker rounded-lg p-6 border border-bloomberg-border">
            <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Insider Sentiment (90 Days)
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-3xl font-bold ${
                  intelligence.insider_sentiment.signal === 'bullish' ? 'text-green-400' :
                  intelligence.insider_sentiment.signal === 'bearish' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {intelligence.insider_sentiment.score > 0 ? '+' : ''}{intelligence.insider_sentiment.score}
                </div>
                <div className="text-sm text-bloomberg-text-muted">Sentiment Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{intelligence.insider_sentiment.recent_buys}</div>
                <div className="text-sm text-bloomberg-text-muted">Buys</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{intelligence.insider_sentiment.recent_sells}</div>
                <div className="text-sm text-bloomberg-text-muted">Sells</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${
                  intelligence.insider_sentiment.net_value >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(intelligence.insider_sentiment.net_value, true)}
                </div>
                <div className="text-sm text-bloomberg-text-muted">Net Value</div>
              </div>
            </div>
          </div>

          {/* Recent Trades */}
          {insiderHistory && (
            <>
              <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
                <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Top Insiders by Activity</h3>
                <div className="space-y-2">
                  {insiderHistory.summary?.top_insiders?.slice(0, 5).map((insider, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-bloomberg-border last:border-0">
                      <div>
                        <div className="text-bloomberg-text font-medium">{insider.name}</div>
                        <div className="text-sm text-bloomberg-text-muted">{insider.trade_count} trades</div>
                      </div>
                      <div className="text-right">
                        <div className="text-bloomberg-text">{formatCurrency(insider.total_value, true)}</div>
                        <div className="text-sm text-bloomberg-text-muted">{insider.total_shares?.toLocaleString()} shares</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
                <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Recent Insider Trades</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-bloomberg-text-muted border-b border-bloomberg-border">
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Insider</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2 text-right">Shares</th>
                        <th className="py-2 px-2 text-right">Price</th>
                        <th className="py-2 px-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insiderHistory.trades?.slice(0, 20).map((trade, i) => (
                        <tr key={i} className="border-b border-bloomberg-border/50 text-sm">
                          <td className="py-2 px-2 text-bloomberg-text-muted">{trade.date}</td>
                          <td className="py-2 px-2 text-bloomberg-text">{trade.owner}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              trade.transaction_type?.includes('Purchase') ? 'bg-green-500/20 text-green-400' :
                              trade.transaction_type?.includes('Sale') ? 'bg-red-500/20 text-red-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {trade.transaction_type?.split(' ')[0]}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-bloomberg-text">{trade.shares?.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-bloomberg-text">{formatCurrency(trade.price)}</td>
                          <td className="py-2 px-2 text-right text-bloomberg-text">{formatCurrency(trade.value, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'executives' && (
        <div className="space-y-4">
          {/* Data Source Transparency */}
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg p-4 border border-blue-500/20">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-bloomberg-text mb-1">Compensation Data Source</h4>
                <p className="text-xs text-bloomberg-text-muted">
                  Executive compensation data is sourced from the company's annual proxy statement (DEF 14A) filed with the SEC. 
                  Total compensation includes base salary, bonus, stock awards, option awards, non-equity incentive plan compensation, 
                  and other benefits. Data is typically updated annually when new proxy filings are released.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-bloomberg-text flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Key Executives
            </h3>
            <span className="text-xs text-bloomberg-text-muted">
              {intelligence.executives?.length || 0} executives found
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {intelligence.executives?.map((exec, i) => (
              <div key={i} className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border hover:border-bloomberg-accent/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-bloomberg-text font-medium truncate">{exec.name}</h4>
                    <p className="text-sm text-bloomberg-accent truncate">{exec.title}</p>
                    {exec.age && (
                      <p className="text-sm text-bloomberg-text-muted">Age: {exec.age}</p>
                    )}
                  </div>
                  {exec.total_pay ? (
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-bloomberg-text font-medium text-lg">
                        {formatCurrency(exec.total_pay, true)}
                      </div>
                      <div className="text-xs text-bloomberg-text-muted">Total Comp</div>
                      <button 
                        className="mt-1 text-xs text-bloomberg-accent hover:text-bloomberg-text flex items-center gap-1"
                        onClick={() => {
                          alert(`Compensation Breakdown for ${exec.name}:\n\nTotal Pay: ${formatCurrency(exec.total_pay)}\n\nThis includes:\n• Base Salary\n• Annual Bonus\n• Stock Awards\n• Option Awards\n• Non-Equity Incentive\n• Other Benefits\n\nSource: Company DEF 14A Proxy Filing`);
                        }}
                      >
                        <HelpCircle className="w-3 h-3" />
                        Details
                      </button>
                    </div>
                  ) : (
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-sm text-bloomberg-text-muted">Not disclosed</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {(!intelligence.executives || intelligence.executives.length === 0) && (
            <div className="text-center py-8 text-bloomberg-text-muted">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Executive information not available</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'technicals' && (
        <div className="space-y-6">
          {/* Chart Patterns */}
          {patterns && patterns.patterns?.length > 0 && (
            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Detected Chart Patterns
              </h3>
              <div className="space-y-3">
                {patterns.patterns.map((pattern, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-bloomberg-border last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pattern.type === 'bullish' ? 'bg-green-500/20 text-green-400' :
                        pattern.type === 'bearish' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {pattern.type.toUpperCase()}
                      </span>
                      <span className="text-bloomberg-text font-medium">{pattern.pattern}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-bloomberg-text-muted">{pattern.confidence}% confidence</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Summary */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Price Levels</h3>
              <div className="space-y-3">
                <MetricRow label="Current Price" value={formatCurrency(intelligence.current_price)} highlight />
                <MetricRow label="52-Week High" value={formatCurrency(intelligence.valuation["52_week_high"])} />
                <MetricRow label="52-Week Low" value={formatCurrency(intelligence.valuation["52_week_low"])} />
                <MetricRow label="All-Time High" value={formatCurrency(intelligence.valuation.all_time_high)} />
                <MetricRow label="% from ATH" value={formatPercent(intelligence.valuation.distance_from_ath)} />
              </div>
            </div>

            <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
              <h3 className="text-lg font-semibold text-bloomberg-text mb-4">Analyst Consensus</h3>
              <div className="space-y-3">
                <MetricRow label="Recommendation" value={intelligence.analysts.recommendation_key} highlight />
                <MetricRow label="Target High" value={formatCurrency(intelligence.analysts.target_high)} />
                <MetricRow label="Target Mean" value={formatCurrency(intelligence.analysts.target_mean)} />
                <MetricRow label="Target Low" value={formatCurrency(intelligence.analysts.target_low)} />
                <MetricRow label="# of Analysts" value={intelligence.analysts.number_of_analysts?.toString()} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components

// Score Card with expandable explanation
function ScoreCardWithExplanation({ 
  label, 
  value, 
  icon: Icon, 
  explanation 
}: {
  label: string;
  scoreKey?: string;
  value: number;
  icon: any;
  explanation?: {
    factors: Array<{ name: string; impact: 'positive' | 'negative' | 'neutral'; points: number; reason: string }>;
    methodology: string;
    weight: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  
  const getScoreColor = (s: number) => {
    if (s >= 70) return 'text-green-400';
    if (s >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-bloomberg-darker rounded-lg border border-bloomberg-border overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-bloomberg-dark/50 transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-bloomberg-text-muted">{label}</span>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-bloomberg-accent" />
            <span className="text-xs text-bloomberg-text-muted">
              {expanded ? '▼' : '▶'}
            </span>
          </div>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(value)}`}>
          {value.toFixed(0)}
        </div>
        <div className="mt-2 h-2 bg-bloomberg-dark rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${
              value >= 70 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${value}%` }}
          />
        </div>
        {explanation && (
          <div className="mt-2 text-xs text-bloomberg-accent">
            {explanation.weight} • Click to see factors
          </div>
        )}
      </button>
      
      {expanded && explanation && (
        <div className="px-4 pb-4 border-t border-bloomberg-border bg-bloomberg-dark/30">
          <p className="text-xs text-bloomberg-text-muted mt-3 mb-3 italic">
            {explanation.methodology}
          </p>
          {explanation.factors.length > 0 ? (
            <div className="space-y-2">
              {explanation.factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    factor.impact === 'positive' ? 'bg-green-500/20 text-green-400' :
                    factor.impact === 'negative' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {factor.impact === 'positive' ? '+' : factor.impact === 'negative' ? '−' : '○'}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium text-bloomberg-text">{factor.name}</div>
                    <div className="text-bloomberg-text-muted">{factor.reason}</div>
                    <div className={`mt-0.5 ${
                      factor.points > 0 ? 'text-green-400' : factor.points < 0 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {factor.points > 0 ? '+' : ''}{factor.points} points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-bloomberg-text-muted">
              Score calculated from technical indicators (RSI, MACD, Moving Averages). 
              Detailed breakdown requires real-time technical data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, subValue, icon: Icon, valueColor }: {
  label: string;
  value: string;
  subValue?: string;
  icon: any;
  valueColor?: string;
}) {
  return (
    <div className="bg-bloomberg-darker rounded-lg p-4 border border-bloomberg-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-bloomberg-text-muted">{label}</span>
        <Icon className="w-4 h-4 text-bloomberg-accent" />
      </div>
      <div className={`text-xl font-bold ${valueColor || 'text-bloomberg-text'}`}>{value}</div>
      {subValue && <div className="text-sm text-bloomberg-text-muted mt-1">{subValue}</div>}
    </div>
  );
}

function MetricRow({ label, value, highlight }: { label: string; value: string | undefined; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-bloomberg-text-muted">{label}</span>
      <span className={`text-sm ${highlight ? 'font-bold text-bloomberg-text' : 'text-bloomberg-text'}`}>
        {value || 'N/A'}
      </span>
    </div>
  );
}

function RiskMeter({ label, score }: { label: string; score: number | undefined }) {
  if (score === undefined || score === null) return null;
  
  const getColor = (s: number) => {
    if (s <= 3) return 'bg-green-500';
    if (s <= 6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-bloomberg-text-muted">{label}</span>
        <span className="text-bloomberg-text">{score}/10</span>
      </div>
      <div className="h-2 bg-bloomberg-dark rounded-full overflow-hidden">
        <div className={`h-full ${getColor(score)} rounded-full`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
}

