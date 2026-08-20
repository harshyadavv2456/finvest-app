/**
 * DailyBriefPage - Daily Investment Brief View
 * 
 * PHASE 16: Replace Alerts with Understanding
 * 
 * Features:
 * - One scroll view
 * - Printable
 * - Shareable (read-only link)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sun, AlertCircle, TrendingUp, TrendingDown,
  Calendar, Clock, Printer, Share2, ChevronRight, AlertTriangle,
  CheckCircle, Info, DollarSign, Target, Zap
} from 'lucide-react';
import { getDailyBriefEngine, DailyBrief, BriefItem } from '../briefing/DailyBriefEngine';
import { PortfolioCore } from '../integrations/portfolio/PortfolioCore';

// =============================================================================
// PRIORITY BADGE COMPONENT
// =============================================================================

interface PriorityBadgeProps {
  priority: BriefItem['priority'];
}

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const config = {
    CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
    ACTION_REQUIRED: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: AlertTriangle },
    WATCH: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Target },
    INFO: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Info }
  };
  
  const { bg, text, icon: Icon } = config[priority];
  
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${bg} ${text}`}>
      <Icon className="w-3 h-3" />
      {priority.replace('_', ' ')}
    </span>
  );
};

// =============================================================================
// SENTIMENT INDICATOR
// =============================================================================

interface SentimentIndicatorProps {
  sentiment: DailyBrief['overall_sentiment'];
}

const SentimentIndicator: React.FC<SentimentIndicatorProps> = ({ sentiment }) => {
  const config = {
    POSITIVE: { bg: 'bg-green-500/20', text: 'text-green-400', icon: TrendingUp, label: 'Positive' },
    NEGATIVE: { bg: 'bg-red-500/20', text: 'text-red-400', icon: TrendingDown, label: 'Negative' },
    NEUTRAL: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Target, label: 'Neutral' },
    MIXED: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Zap, label: 'Mixed' }
  };
  
  const { bg, text, icon: Icon, label } = config[sentiment];
  
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${bg}`}>
      <Icon className={`w-5 h-5 ${text}`} />
      <span className={`text-sm font-medium ${text}`}>{label} Outlook</span>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DailyBriefPage() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Load brief
  useEffect(() => {
    const loadBrief = async () => {
      setLoading(true);
      try {
        const engine = getDailyBriefEngine();
        const portfolioCore = PortfolioCore.getInstance();
        const portfolioState = portfolioCore.getState();
        
        const portfolio = portfolioState.status === 'READY' ? portfolioState.snapshot : null;
        const generatedBrief = engine.generateBrief(portfolio);
        setBrief(generatedBrief);
      } catch (err) {
        console.error('Failed to generate brief:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadBrief();
  }, []);
  
  // Handle print
  const handlePrint = () => {
    window.print();
  };
  
  // Handle share
  const handleShare = () => {
    if (!brief) return;
    
    const engine = getDailyBriefEngine();
    const portfolioCore = PortfolioCore.getInstance();
    const portfolioState = portfolioCore.getState();
    const portfolio = portfolioState.status === 'READY' ? portfolioState.snapshot : null;
    
    const shareText = engine.generateShareableBrief(portfolio);
    
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  
  // Format date
  const formattedDate = useMemo(() => {
    if (!brief) return '';
    const date = new Date(brief.date);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }, [brief]);
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-gray-400">Generating your daily brief...</p>
        </div>
      </div>
    );
  }
  
  // No brief
  if (!brief) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl text-white mb-2">No Brief Available</h2>
          <p className="text-gray-400 mb-4">Unable to generate daily brief at this time.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white print:bg-white print:text-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-gray-800 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleShare}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                copied 
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              }`}
            >
              <Share2 className="w-4 h-4" />
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Sun className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white print:text-black">Daily Investment Brief</h1>
              <p className="text-gray-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formattedDate}
              </p>
            </div>
          </div>
          
          <SentimentIndicator sentiment={brief.overall_sentiment} />
        </div>
        
        {/* Summary */}
        <section className="mb-8 p-6 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-2xl">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-400" />
            Summary
          </h2>
          <p className="text-gray-300 text-lg leading-relaxed">{brief.portfolio_impact_summary}</p>
          
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
              <span className="text-gray-400 text-sm">Events:</span>
              <span className="text-white font-medium">{brief.total_events}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
              <span className="text-gray-400 text-sm">Portfolio Relevant:</span>
              <span className="text-white font-medium">{brief.portfolio_relevant_events}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 rounded-lg">
              <span className="text-orange-400 text-sm">Action Required:</span>
              <span className="text-orange-400 font-medium">{brief.action_required_count}</span>
            </div>
          </div>
        </section>
        
        {/* Requires Attention */}
        {brief.what_requires_attention.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Requires Attention
            </h2>
            <div className="space-y-3">
              {brief.what_requires_attention.map((item, i) => (
                <div
                  key={i}
                  className="p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <PriorityBadge priority={item.priority} />
                        {item.symbols.map((s, j) => (
                          <button
                            key={j}
                            onClick={() => navigate(`/stock/${s}`)}
                            className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/30 transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <h3 className="font-medium text-white mb-1">{item.title}</h3>
                      <p className="text-sm text-gray-400">{item.detail}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Signal Changes */}
        {brief.signals_changed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Signal Changes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {brief.signals_changed.map((change, i) => {
                const isUpgrade = change.newSignal === 'INITIATE' || change.newSignal === 'BUY';
                return (
                  <button
                    key={i}
                    onClick={() => navigate(`/stock-intelligence/US/${change.symbol}`)}
                    className="p-4 bg-[#0d1117] border border-gray-800 rounded-xl hover:border-gray-700 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">{change.symbol}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        isUpgrade ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {isUpgrade ? '↑ Upgrade' : '↓ Downgrade'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{change.oldSignal}</span>
                      <span className="text-gray-600">→</span>
                      <span className={`text-xs font-medium ${
                        isUpgrade ? 'text-green-400' : 'text-red-400'
                      }`}>{change.newSignal}</span>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Conviction: {change.conviction.toFixed(0)}%
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        
        {/* Tax Events */}
        {brief.tax_events.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              Tax Events
            </h2>
            <div className="space-y-3">
              {brief.tax_events.map((event, i) => (
                <div
                  key={i}
                  className="p-4 bg-gradient-to-r from-green-900/20 to-emerald-900/10 border border-green-500/20 rounded-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-green-400">{event.symbol}</span>
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {event.eventType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-right">
                      {event.daysToEvent > 0 ? (
                        <div className="text-sm text-yellow-400">
                          {event.daysToEvent} days remaining
                        </div>
                      ) : (
                        <div className="text-sm text-green-400">
                          <CheckCircle className="w-4 h-4 inline mr-1" />
                          Threshold crossed
                        </div>
                      )}
                      {event.potentialSaving > 0 && (
                        <div className="text-xs text-gray-400">
                          Potential savings: ₹{event.potentialSaving.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Can Wait */}
        {brief.what_can_wait.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              Can Wait
            </h2>
            <div className="space-y-2">
              {brief.what_can_wait.map((item, i) => (
                <div
                  key={i}
                  className="p-3 bg-[#0d1117] border border-gray-800/50 rounded-lg flex items-center gap-3"
                >
                  <Info className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-300">{item.title}</span>
                    {item.symbols.length > 0 && (
                      <span className="text-xs text-gray-500 ml-2">
                        ({item.symbols.join(', ')})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Footer */}
        <footer className="pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
          <p>Generated at {new Date(brief.generated_at).toLocaleString()}</p>
          <p className="mt-1">FinVest Daily Brief • Not Financial Advice</p>
        </footer>
      </main>
    </div>
  );
}

