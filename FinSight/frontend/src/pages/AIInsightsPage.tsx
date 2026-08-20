/**
 * AI Insights Page
 * Full-screen chat interface with AI-powered market analysis
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Brain, Send, Sparkles, TrendingUp,
  MessageSquare, Lightbulb, RefreshCw, ChevronRight,
  Zap, BarChart2
} from 'lucide-react';
import { api } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIInsightsPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [marketOutlook, setMarketOutlook] = useState<string | null>(null);
  const [loadingOutlook, setLoadingOutlook] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    "Which stocks are insiders buying?",
    "What is Berkshire Hathaway's largest holding?",
    "Show me cluster buy signals",
    "FII/DII sentiment today?",
    "Top hedge fund moves",
    "High conviction insider buys",
  ];

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (questionOverride?: string) => {
    const question = questionOverride || input;
    if (!question.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.get(`/api/ai/ask?question=${encodeURIComponent(question)}`);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: res.data.answer || "I couldn't process that. Please try again.",
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Error getting AI response:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, AI analysis temporarily unavailable. Backend may be warming up - please try again in a moment.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketOutlook = async () => {
    setLoadingOutlook(true);
    try {
      const res = await api.get('/api/ai/market-outlook');
      setMarketOutlook(res.data.analysis);
    } catch (err) {
      console.error('Error fetching market outlook:', err);
      setMarketOutlook("Market outlook temporarily unavailable. Please try again.");
    } finally {
      setLoadingOutlook(false);
    }
  };

  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-b border-purple-500/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">FinSight AI</h1>
                <p className="text-xs text-purple-400/80 hidden md:block">Your intelligent financial assistant</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white lg:hidden"
          >
            <BarChart2 size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center px-4">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 text-center">Welcome to FinSight AI</h2>
                <p className="text-gray-400 text-center mb-8 max-w-md">
                  I have access to 10 years of stock data, 161K+ insider trades, and 145 hedge fund portfolios.
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl w-full">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(q)}
                      className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-sm text-gray-300 hover:bg-purple-500/20 hover:border-purple-500/40 transition-all text-left flex items-start gap-2"
                    >
                      <Lightbulb className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                      : 'bg-gray-800/80 text-gray-200 border border-gray-700'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2 text-purple-400">
                      <Brain size={16} />
                      <span className="text-xs font-semibold">FinSight AI</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                  <div className="text-xs opacity-50 mt-2">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800/80 p-4 rounded-2xl border border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                    <span className="text-sm text-gray-400">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-800 bg-gray-900/50">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Ask about stocks, insider trading, hedge funds..."
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                disabled={loading}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="px-5 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all shadow-lg shadow-purple-500/25"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className={`w-80 border-l border-gray-800 bg-gray-900/50 overflow-y-auto ${showSidebar ? 'block' : 'hidden'} lg:block`}>
          <div className="p-4 space-y-4">
            {/* Market Outlook */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
                  <TrendingUp className="text-green-400 w-4 h-4" />
                  Market Outlook
                </h3>
                <button
                  onClick={fetchMarketOutlook}
                  disabled={loadingOutlook}
                  className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <RefreshCw size={14} className={`text-gray-400 ${loadingOutlook ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingOutlook ? (
                <div className="text-center py-6">
                  <RefreshCw className="animate-spin w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Generating...</p>
                </div>
              ) : marketOutlook ? (
                <div className="text-xs text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {marketOutlook}
                </div>
              ) : (
                <button
                  onClick={fetchMarketOutlook}
                  className="w-full py-3 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-colors text-sm font-medium"
                >
                  <Zap size={14} className="inline mr-2" />
                  Generate AI Outlook
                </button>
              )}
            </div>

            {/* Quick Navigation */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
              <h3 className="font-semibold text-white mb-3 text-sm flex items-center gap-2">
                <MessageSquare className="text-blue-400 w-4 h-4" />
                Quick Analysis
              </h3>
              
              <div className="space-y-2">
                {[
                  { path: '/hedge-funds', label: '🏦 Hedge Funds', color: 'amber' },
                  { path: '/insider-flow', label: '📊 Insider Flow', color: 'orange' },
                  { path: '/smart-money', label: '💰 Smart Money', color: 'cyan' },
                  { path: '/portfolio', label: '📈 Portfolio', color: 'green' },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full p-2.5 bg-${item.color}-500/10 border border-${item.color}-500/20 rounded-lg text-left hover:bg-${item.color}-500/20 transition-all flex items-center justify-between text-sm`}
                  >
                    <span className="text-gray-300">{item.label}</span>
                    <ChevronRight className="text-gray-500 w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Data Stats */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
              <h3 className="font-semibold text-white mb-3 text-sm">📚 Data Sources</h3>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Stock History', value: '10 Years' },
                  { label: 'Insider Trades', value: '161K+' },
                  { label: 'Hedge Funds', value: '145+' },
                  { label: '13F Holdings', value: '31K+' },
                  { label: 'Stocks Tracked', value: '900+' },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between text-gray-400">
                    <span>{item.label}</span>
                    <span className="text-purple-400 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
