/**
 * AI Pilot - Investment Planning Engine
 * Creates structured execution plans, NOT advice.
 * 
 * Capabilities:
 * - Parse intent: "Invest 25k", "Reduce risk", "Need cash"
 * - Pull FinSight signals
 * - Rank candidates
 * - Generate PLAN OBJECT (not orders)
 * 
 * NO execution - requires confirmation.
 */

import { useState, useCallback } from 'react';
import { 
  Bot, Send, TrendingUp, AlertCircle,
  Target, Shield, Wallet, Clock, Sparkles,
  RefreshCw, CheckCircle2, XCircle, IndianRupee
} from 'lucide-react';
import { api } from '../lib/api';

interface PlanCandidate {
  ticker: string;
  company_name?: string;
  market: string;
  signal?: string;
  conviction?: number;
  allocation_pct?: number;
  shares?: number;
  amount?: number;
  reason?: string;
}

interface ExecutionPlan {
  id: string;
  intent: 'INVEST' | 'REDUCE_RISK' | 'GENERATE_CASH' | 'REBALANCE';
  capital?: number;
  candidates: PlanCandidate[];
  reasoning: string;
  risk: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
  };
  tax_impact?: {
    estimated_tax: number;
    stcg_portion: number;
    ltcg_portion: number;
  };
  requires_confirmation: boolean;
  created_at: string;
}

const INTENT_EXAMPLES = [
  { text: "Invest ₹50,000", intent: 'INVEST' },
  { text: "Reduce portfolio risk", intent: 'REDUCE_RISK' },
  { text: "I need ₹2 lakh cash", intent: 'GENERATE_CASH' },
  { text: "Rebalance to target", intent: 'REBALANCE' },
];

export default function AIPilotPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseIntent = (text: string): { intent: ExecutionPlan['intent']; capital?: number } => {
    const lower = text.toLowerCase();
    
    // Parse capital amount
    let capital: number | undefined;
    const amountMatch = text.match(/₹?\s*([\d,]+)\s*(k|l|lakh|lac|cr|crore)?/i);
    if (amountMatch) {
      let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const multiplier = amountMatch[2]?.toLowerCase();
      if (multiplier === 'k') amount *= 1000;
      else if (['l', 'lakh', 'lac'].includes(multiplier || '')) amount *= 100000;
      else if (['cr', 'crore'].includes(multiplier || '')) amount *= 10000000;
      capital = amount;
    }
    
    // Parse intent
    if (lower.includes('invest') || lower.includes('buy') || lower.includes('deploy')) {
      return { intent: 'INVEST', capital };
    }
    if (lower.includes('risk') || lower.includes('defensive') || lower.includes('safe')) {
      return { intent: 'REDUCE_RISK', capital };
    }
    if (lower.includes('cash') || lower.includes('sell') || lower.includes('liquidate') || lower.includes('need')) {
      return { intent: 'GENERATE_CASH', capital };
    }
    if (lower.includes('rebalance') || lower.includes('adjust')) {
      return { intent: 'REBALANCE', capital };
    }
    
    return { intent: 'INVEST', capital };
  };

  const generatePlan = useCallback(async (userInput: string) => {
    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const { intent, capital } = parseIntent(userInput);
      
      // Fetch real data from FinSight
      let screenerData;
      try {
        screenerData = await api.getScreener({ 
          limit: 100, 
          sort_by: intent === 'REDUCE_RISK' ? 'vol_20d' : 'ret_1m',
          sort_dir: intent === 'REDUCE_RISK' ? 'asc' : 'desc'
        });
      } catch (e) {
        throw new Error('Failed to fetch market data. Please try again.');
      }

      if (!screenerData?.rows?.length) {
        throw new Error('No market data available. Cannot create plan.');
      }

      // Generate candidates based on intent
      let candidates: PlanCandidate[] = [];
      let reasoning = '';
      let riskLevel: ExecutionPlan['risk']['level'] = 'MEDIUM';

      const totalCapital = capital || 100000;
      
      if (intent === 'INVEST') {
        // Top performers for investment
        const topStocks = screenerData.rows
          .filter(s => (s.ret_1m ?? 0) > 0 && (s.vol_20d ?? 100) < 50)
          .slice(0, 5);
        
        const perStock = totalCapital / Math.max(topStocks.length, 1);
        
        candidates = topStocks.map((s, i) => ({
          ticker: s.ticker,
          company_name: s.company_name,
          market: s.market,
          signal: 'INITIATE',
          conviction: Math.max(60, 90 - i * 5),
          allocation_pct: 100 / topStocks.length,
          amount: perStock,
          shares: Math.floor(perStock / (s.current_price || 1000)),
          reason: `Strong momentum (+${(s.ret_1m || 0).toFixed(1)}% 1M), moderate volatility`
        }));

        reasoning = `Based on FinSight intelligence, these ${candidates.length} stocks show strong momentum with controlled volatility. Recommended equal-weight allocation of ${(100/candidates.length).toFixed(0)}% each.`;
        riskLevel = 'MEDIUM';
        
      } else if (intent === 'REDUCE_RISK') {
        // Low volatility stocks
        const lowVolStocks = screenerData.rows
          .filter(s => (s.vol_20d ?? 100) < 25)
          .slice(0, 5);
        
        candidates = lowVolStocks.map((s, i) => ({
          ticker: s.ticker,
          company_name: s.company_name,
          market: s.market,
          signal: 'HOLD',
          conviction: Math.max(70, 95 - i * 5),
          allocation_pct: 100 / lowVolStocks.length,
          reason: `Low volatility (${(s.vol_20d || 0).toFixed(1)}%), stable performer`
        }));

        reasoning = `Identified ${candidates.length} low-volatility stocks to reduce portfolio risk. These have demonstrated stability with volatility under 25%.`;
        riskLevel = 'LOW';
        
      } else if (intent === 'GENERATE_CASH') {
        // Stocks with gains that can be sold
        const gainers = screenerData.rows
          .filter(s => (s.ret_1m ?? 0) > 5)
          .slice(0, 5);
        
        const targetCash = capital || 200000;
        let accumulated = 0;
        
        gainers.forEach((s) => {
          const estValue = 50000; // Assuming average position
          if (accumulated < targetCash) {
            accumulated += estValue;
            candidates.push({
              ticker: s.ticker,
              company_name: s.company_name,
              market: s.market,
              signal: 'EXIT',
              conviction: 75,
              amount: estValue,
              reason: `Book profits (+${(s.ret_1m || 0).toFixed(1)}% gain)`
            });
          }
        });

        reasoning = `To generate ₹${(capital || 200000).toLocaleString()} in cash, consider booking profits on these positions with gains. Tax implications should be reviewed before execution.`;
        riskLevel = 'LOW';
        
      } else if (intent === 'REBALANCE') {
        // Mix of sectors/markets
        const markets = [...new Set(screenerData.rows.map(s => s.market))];
        const diversified = markets.flatMap(m => 
          screenerData.rows.filter(s => s.market === m).slice(0, 2)
        ).slice(0, 5);

        candidates = diversified.map(s => ({
          ticker: s.ticker,
          company_name: s.company_name,
          market: s.market,
          signal: 'INITIATE',
          conviction: 70,
          allocation_pct: 100 / diversified.length,
          reason: `Diversification across ${s.market} market`
        }));

        reasoning = `Rebalancing plan includes positions across ${markets.length} markets for better diversification. Consider trimming concentrated positions.`;
        riskLevel = 'MEDIUM';
      }

      // Estimate tax impact
      const taxImpact = intent === 'GENERATE_CASH' ? {
        estimated_tax: (capital || 200000) * 0.15,
        stcg_portion: (capital || 200000) * 0.4,
        ltcg_portion: (capital || 200000) * 0.6,
      } : undefined;

      const newPlan: ExecutionPlan = {
        id: `plan_${Date.now()}`,
        intent,
        capital,
        candidates,
        reasoning,
        risk: {
          level: riskLevel,
          description: riskLevel === 'LOW'
            ? 'Conservative approach with lower risk'
            : riskLevel === 'MEDIUM'
            ? 'Balanced risk-reward profile'
            : 'This plan involves higher risk positions'
        },
        tax_impact: taxImpact,
        requires_confirmation: true,
        created_at: new Date().toISOString(),
      };

      setPlan(newPlan);
      
    } catch (e: any) {
      setError(e.message || 'Failed to generate plan. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      generatePlan(input);
    }
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'INVEST': return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'REDUCE_RISK': return <Shield className="w-5 h-5 text-blue-400" />;
      case 'GENERATE_CASH': return <Wallet className="w-5 h-5 text-amber-400" />;
      case 'REBALANCE': return <Target className="w-5 h-5 text-purple-400" />;
      default: return <Sparkles className="w-5 h-5 text-gray-400" />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'text-green-400 bg-green-500/20';
      case 'HIGH': return 'text-red-400 bg-red-500/20';
      default: return 'text-amber-400 bg-amber-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl mb-4">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">AI Pilot</h1>
          <p className="text-gray-400 mt-2">Investment Planning Engine</p>
          <span className="inline-block mt-2 px-3 py-1 bg-pink-500/20 text-pink-300 text-xs rounded-full">
            Beta • Plans only, no execution
          </span>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What would you like to do? e.g., Invest ₹50,000"
                className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-white placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{loading ? 'Planning...' : 'Create Plan'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Intent Examples */}
        {!plan && !loading && (
          <div className="flex flex-wrap gap-2 justify-center">
            {INTENT_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setInput(ex.text)}
                className="px-4 py-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
              >
                {ex.text}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium">Failed to create plan</p>
              <p className="text-sm text-red-400/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Plan Result */}
        {plan && (
          <div className="space-y-4">
            {/* Plan Header */}
            <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getIntentIcon(plan.intent)}
                  <div>
                    <h2 className="text-xl font-bold text-white">{plan.intent.replace('_', ' ')} Plan</h2>
                    {plan.capital && (
                      <p className="text-sm text-gray-400 flex items-center gap-1">
                        <IndianRupee className="w-3 h-3" />
                        {plan.capital.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRiskColor(plan.risk.level)}`}>
                  {plan.risk.level} Risk
                </span>
              </div>
              
              <p className="text-gray-300 text-sm">{plan.reasoning}</p>
              
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                <span>Generated {new Date(plan.created_at).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Candidates */}
            <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h3 className="font-semibold text-white">Recommended Actions</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {plan.candidates.map((c, i) => (
                  <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        c.signal === 'EXIT' ? 'bg-red-500/20' : 'bg-green-500/20'
                      }`}>
                        <span className="text-xs font-bold">
                          {i + 1}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-white">{c.ticker}</div>
                        <div className="text-xs text-gray-500">{c.company_name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${
                        c.signal === 'EXIT' ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {c.signal}
                      </div>
                      {c.amount && (
                        <div className="text-xs text-gray-400">₹{c.amount.toLocaleString()}</div>
                      )}
                      {c.allocation_pct && !c.amount && (
                        <div className="text-xs text-gray-400">{c.allocation_pct.toFixed(0)}%</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tax Impact */}
            {plan.tax_impact && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
                <h3 className="font-semibold text-amber-300 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Estimated Tax Impact
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total Tax</span>
                    <p className="text-amber-400 font-semibold">₹{plan.tax_impact.estimated_tax.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">STCG Portion</span>
                    <p className="text-white">₹{plan.tax_impact.stcg_portion.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">LTCG Portion</span>
                    <p className="text-white">₹{plan.tax_impact.ltcg_portion.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmation */}
            <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-white font-medium">Review Required</p>
                    <p className="text-xs text-gray-400">This plan requires your confirmation before any action</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 flex items-center gap-2 transition-colors">
                    <XCircle className="w-4 h-4" />
                    Discard
                  </button>
                  <button 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white flex items-center gap-2 transition-colors cursor-not-allowed opacity-50"
                    disabled
                    title="Execution coming soon"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm
                  </button>
                </div>
              </div>
            </div>

            {/* Plan JSON (for debugging) */}
            <details className="text-xs">
              <summary className="text-gray-500 cursor-pointer hover:text-gray-400">View Plan Object</summary>
              <pre className="mt-2 p-4 bg-gray-900 rounded-lg overflow-auto text-gray-400">
                {JSON.stringify(plan, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

