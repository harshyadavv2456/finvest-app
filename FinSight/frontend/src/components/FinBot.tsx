/**
 * FinBot - Data-Grounded Financial Assistant
 * 
 * RULES:
 * 1. ONLY answers using real data from APIs
 * 2. Fetches required data before responding
 * 3. Attaches citations internally
 * 4. REFUSES answers if data is missing
 * 
 * Data Sources:
 * - FinSight APIs (screener, intelligence)
 * - Insider/Hedge fund data
 * - FII-DII flows
 * - Portfolio state (when available)
 * 
 * FinBot = analyst, NOT ChatGPT.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Brain, Sparkles, Minimize2, AlertCircle, Database } from 'lucide-react';
import { api } from '../lib/api';

interface DataSource {
  name: string;
  available: boolean;
  timestamp?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: DataSource[];
  isError?: boolean;
}

// Data context that FinBot can use
interface FinBotContext {
  screenerData?: any[];
  insiderData?: any[];
  hedgeFundData?: any[];
  fiiDiiData?: any;
  stockData?: Record<string, any>;
}

export default function FinBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "I'm FinBot, your data-grounded financial analyst. I ONLY answer using real market data - no hallucinations. Ask me about:\n\n• Stock screener results\n• Insider trading activity\n• Hedge fund positions\n• FII/DII flows\n• Market trends",
      timestamp: new Date(),
      sources: [{ name: 'System', available: true }]
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<FinBotContext>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Identify what data is needed for the query
  const identifyDataNeeds = (query: string): string[] => {
    const needs: string[] = [];
    const lower = query.toLowerCase();
    
    if (lower.includes('insider') || lower.includes('buying') || lower.includes('selling')) {
      needs.push('insider');
    }
    if (lower.includes('hedge fund') || lower.includes('institution')) {
      needs.push('hedgeFund');
    }
    if (lower.includes('fii') || lower.includes('dii') || lower.includes('foreign')) {
      needs.push('fiiDii');
    }
    if (lower.includes('stock') || lower.includes('screen') || lower.includes('top') || 
        lower.includes('best') || lower.includes('market') || lower.includes('trend') ||
        lower.includes('performer') || lower.includes('gainer') || lower.includes('loser')) {
      needs.push('screener');
    }
    
    // Default to screener if nothing specific identified
    if (needs.length === 0) {
      needs.push('screener');
    }
    
    return needs;
  };

  // Fetch required data
  const fetchRequiredData = useCallback(async (needs: string[]): Promise<{ context: FinBotContext; sources: DataSource[] }> => {
    const newContext: FinBotContext = { ...context };
    const sources: DataSource[] = [];
    
    for (const need of needs) {
      try {
        switch (need) {
          case 'screener':
            const screenerRes = await api.getScreener({ limit: 50, sort_by: 'ret_1m', sort_dir: 'desc' });
            newContext.screenerData = screenerRes.rows;
            sources.push({ name: 'FinSight Screener', available: true, timestamp: new Date().toISOString() });
            break;
            
          case 'insider':
            // Try to fetch insider data
            try {
              const insiderRes = await api.get('/api/insider-trades?limit=20');
              newContext.insiderData = insiderRes.data?.trades || [];
              sources.push({ name: 'Insider Trades', available: true, timestamp: new Date().toISOString() });
            } catch {
              sources.push({ name: 'Insider Trades', available: false });
            }
            break;
            
          case 'hedgeFund':
            try {
              const hfRes = await api.get('/api/hedge-funds?limit=10');
              newContext.hedgeFundData = hfRes.data?.funds || [];
              sources.push({ name: 'Hedge Fund Data', available: true, timestamp: new Date().toISOString() });
            } catch {
              sources.push({ name: 'Hedge Fund Data', available: false });
            }
            break;
            
          case 'fiiDii':
            try {
              const fiiRes = await api.get('/api/fii-dii/summary');
              newContext.fiiDiiData = fiiRes.data;
              sources.push({ name: 'FII/DII Flows', available: true, timestamp: new Date().toISOString() });
            } catch {
              sources.push({ name: 'FII/DII Flows', available: false });
            }
            break;
        }
      } catch (e) {
        sources.push({ name: need, available: false });
      }
    }
    
    setContext(newContext);
    return { context: newContext, sources };
  }, [context]);

  // Generate response based on data
  const generateGroundedResponse = (query: string, dataContext: FinBotContext, sources: DataSource[]): string => {
    const lower = query.toLowerCase();
    const availableSources = sources.filter(s => s.available);
    
    // Check if we have the data we need
    if (availableSources.length === 0) {
      return "I don't have the data needed to answer this question. The required data sources are currently unavailable.";
    }

    // Top performers / gainers
    if (lower.includes('top') || lower.includes('best') || lower.includes('gainer') || lower.includes('performer')) {
      if (!dataContext.screenerData?.length) {
        return "I don't have updated screener data to show top performers. Please try again later.";
      }
      
      const topStocks = dataContext.screenerData.slice(0, 5);
      let response = "**Top Performers (Based on FinSight Screener)**\n\n";
      topStocks.forEach((s, i) => {
        response += `${i + 1}. **${s.ticker}** (${s.market})\n`;
        response += `   • 1M Return: ${(s.ret_1m || 0).toFixed(1)}%\n`;
        response += `   • Price: ${s.current_price?.toFixed(2) || 'N/A'}\n\n`;
      });
      return response;
    }

    // Losers / worst performers
    if (lower.includes('loser') || lower.includes('worst') || lower.includes('decline')) {
      if (!dataContext.screenerData?.length) {
        return "I don't have updated screener data to show losers.";
      }
      
      const losers = [...dataContext.screenerData].sort((a, b) => (a.ret_1m || 0) - (b.ret_1m || 0)).slice(0, 5);
      let response = "**Worst Performers (Based on FinSight Screener)**\n\n";
      losers.forEach((s, i) => {
        response += `${i + 1}. **${s.ticker}** (${s.market})\n`;
        response += `   • 1M Return: ${(s.ret_1m || 0).toFixed(1)}%\n\n`;
      });
      return response;
    }

    // Insider activity
    if (lower.includes('insider')) {
      if (!dataContext.insiderData?.length) {
        return "I don't have updated insider trading data available right now. This data source may be temporarily unavailable.";
      }
      
      const buys = dataContext.insiderData.filter(t => t.transaction_type === 'BUY');
      const sells = dataContext.insiderData.filter(t => t.transaction_type === 'SELL');
      
      let response = "**Recent Insider Activity**\n\n";
      response += `• ${buys.length} insider buys\n`;
      response += `• ${sells.length} insider sells\n\n`;
      
      if (buys.length > 0) {
        response += "**Top Insider Buys:**\n";
        buys.slice(0, 3).forEach(t => {
          response += `• ${t.ticker}: ${t.insider_name || 'Executive'} bought $${(t.value || 0).toLocaleString()}\n`;
        });
      }
      return response;
    }

    // FII/DII
    if (lower.includes('fii') || lower.includes('dii') || lower.includes('foreign')) {
      if (!dataContext.fiiDiiData) {
        return "I don't have current FII/DII flow data available. This data source may be temporarily unavailable.";
      }
      
      const data = dataContext.fiiDiiData;
      let response = "**FII/DII Flow Summary**\n\n";
      response += `• FII Net: ₹${(data.fii_net || 0).toLocaleString()} Cr\n`;
      response += `• DII Net: ₹${(data.dii_net || 0).toLocaleString()} Cr\n`;
      response += `• Trend: ${data.trend || 'N/A'}\n`;
      return response;
    }

    // Hedge funds
    if (lower.includes('hedge fund') || lower.includes('institution')) {
      if (!dataContext.hedgeFundData?.length) {
        return "I don't have current hedge fund data available. This data source may be temporarily unavailable.";
      }
      
      let response = "**Top Hedge Fund Holdings**\n\n";
      dataContext.hedgeFundData.slice(0, 5).forEach((hf, i) => {
        response += `${i + 1}. ${hf.name || hf.fund_name}\n`;
        response += `   • AUM: $${((hf.aum || 0) / 1e9).toFixed(1)}B\n\n`;
      });
      return response;
    }

    // Market overview
    if (lower.includes('market') || lower.includes('overview')) {
      if (!dataContext.screenerData?.length) {
        return "I don't have current market data to provide an overview.";
      }
      
      const gainers = dataContext.screenerData.filter(s => (s.ret_1d || 0) > 0).length;
      const losers = dataContext.screenerData.filter(s => (s.ret_1d || 0) < 0).length;
      const avgReturn = dataContext.screenerData.reduce((acc, s) => acc + (s.ret_1m || 0), 0) / dataContext.screenerData.length;
      
      let response = "**Market Overview (FinSight Data)**\n\n";
      response += `• Stocks tracked: ${dataContext.screenerData.length}\n`;
      response += `• Today: ${gainers} ↑ | ${losers} ↓\n`;
      response += `• Avg 1M return: ${avgReturn.toFixed(1)}%\n`;
      return response;
    }

    // Specific stock query
    const tickerMatch = query.match(/\b([A-Z]{2,5})\b/);
    if (tickerMatch) {
      const ticker = tickerMatch[1];
      const stock = dataContext.screenerData?.find(s => 
        s.ticker.toUpperCase().includes(ticker) || 
        s.ticker.replace('.NS', '').toUpperCase() === ticker
      );
      
      if (stock) {
        let response = `**${stock.ticker}** - ${stock.company_name || 'Stock'}\n\n`;
        response += `• Price: ${stock.current_price?.toFixed(2) || 'N/A'}\n`;
        response += `• 1D: ${(stock.ret_1d || 0).toFixed(2)}%\n`;
        response += `• 1M: ${(stock.ret_1m || 0).toFixed(1)}%\n`;
        response += `• Market: ${stock.market}\n`;
        return response;
      } else {
        return `I don't have data for ${ticker} in my current screener. Try searching in the Screener page for more stocks.`;
      }
    }

    // Default - show what data we have
    let response = "Based on available data:\n\n";
    if (dataContext.screenerData?.length) {
      response += `• ${dataContext.screenerData.length} stocks in screener\n`;
    }
    response += "\nTry asking about:\n";
    response += "• Top performers\n";
    response += "• Market overview\n";
    response += "• Specific stock (e.g., 'Tell me about RELIANCE')\n";
    
    return response;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const query = input;
    setInput('');
    setLoading(true);

    try {
      // Step 1: Identify what data we need
      const dataNeeds = identifyDataNeeds(query);
      
      // Step 2: Fetch required data
      const { context: dataContext, sources } = await fetchRequiredData(dataNeeds);
      
      // Step 3: Generate grounded response
      const response = generateGroundedResponse(query, dataContext, sources);
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        sources: sources,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err: any) {
      console.error('FinBot error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I couldn't fetch the required data to answer your question. Please try again in a moment.",
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    "Top performers this month",
    "Market overview",
    "Show worst losers",
    "FII/DII activity",
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 p-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full shadow-2xl shadow-purple-500/50 hover:shadow-purple-500/70 hover:scale-110 transition-all duration-300 group"
      >
        <MessageSquare className="w-6 h-6 text-white" />
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <Database className="w-3 h-3 text-white" />
        </span>
        <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Data-grounded FinBot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 ${isMinimized ? 'w-72' : 'w-[90vw] md:w-[420px]'}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white">FinBot</h3>
            <p className="text-xs text-white/70 flex items-center gap-1">
              <Database size={10} />
              Data-Grounded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <Minimize2 className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="bg-gray-900 h-80 md:h-96 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-md'
                      : msg.isError
                      ? 'bg-red-900/50 text-red-200 rounded-bl-md border border-red-500/30'
                      : 'bg-gray-800 text-gray-200 rounded-bl-md'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mb-2 text-purple-400 text-xs">
                      {msg.isError ? (
                        <>
                          <AlertCircle size={12} />
                          <span>Error</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} />
                          <span>FinBot</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  
                  {/* Data sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-700/50">
                      <div className="text-[10px] text-gray-500 mb-1">Data Sources:</div>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((source, j) => (
                          <span
                            key={j}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              source.available 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {source.name} {source.available ? '✓' : '✗'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-md">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                    <Database size={12} className="animate-pulse" />
                    <span>Fetching data...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 2 && (
            <div className="bg-gray-800 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="px-3 py-1.5 bg-purple-500/20 text-purple-300 text-xs rounded-full whitespace-nowrap hover:bg-purple-500/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="bg-gray-800 rounded-b-2xl p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about real market data..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-xl text-white text-sm placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-xl text-white transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
