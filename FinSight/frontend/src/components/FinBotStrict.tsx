/**
 * FinBot - AI-Powered Recommendation Memory Query Engine
 * 
 * Uses Groq LLaMA for natural language understanding.
 * Queries the platform's recommendation data ONLY.
 * 
 * FinBot MUST:
 * - Answer questions about recommendations (INITIATE/HOLD/AVOID)
 * - Explain what changed and why
 * - Cite specific data from the platform
 * 
 * FinBot must NOT:
 * - Provide trading advice
 * - Recommend best stocks
 * - Predict prices
 */

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Minimize2, ChevronUp, Sparkles } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://finvest-api-gwkz.onrender.com';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  sources?: string[];
}

// =============================================================================
// API CALL
// =============================================================================

async function callFinBotAPI(
  message: string, 
  history: Array<{role: string; content: string}>,
  market: string = 'US'
): Promise<{response: string; sources: string[]; intent_detected: string}> {
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // Increased to 60s
  
  try {
    const res = await fetch(`${API_BASE}/api/finbot/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ message, market, history }),
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeout);
    
    if (err.name === 'AbortError') {
      return {
        response: "Request timed out. The server might be starting up. Please try again in a moment.",
        sources: [],
        intent_detected: "TIMEOUT"
      };
    }
    
    // CORS or network error - provide helpful fallback
    if (err.message?.includes('fetch') || err.message?.includes('CORS') || err.message?.includes('network')) {
      return {
        response: "I'm having trouble connecting right now. The backend might be restarting (free tier servers sleep after inactivity). Please try again in 30-60 seconds.\n\nIn the meantime, you can:\n- Check the **Simulator** page for current recommendations\n- Visit **Intelligence** for detailed stock analysis\n- Use the **Screener** to filter stocks",
        sources: [],
        intent_detected: "CONNECTION_ERROR"
      };
    }
    
    throw err;
  }
}

// =============================================================================
// FINBOT COMPONENT
// =============================================================================

export default function FinBotStrict() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [market, setMarket] = useState<'US' | 'IN'>('US');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm FinBot, your recommendation memory assistant.

Ask me about any stock and I'll explain:
• Current stance (INITIATE/HOLD/AVOID)
• Conviction level and why
• What changed recently
• Risk factors

Try: "What's your stance on AAPL?" or "Explain NVDA recommendation"

I analyze data, not provide trading advice.`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setLoading(true);

    try {
      // Build history from last few messages
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));
      
      const result = await callFinBotAPI(currentInput, history, market);

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
        sources: result.sources
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage = err.message?.includes('fetch') || err.message?.includes('network')
        ? "Connection failed. The server might be waking up (free tier). Please wait 30-60 seconds and try again.\n\nTip: Check **Simulator** or **Intelligence** pages for current recommendations."
        : "Sorry, I encountered an error. Please try again.";
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-transform group"
        title="Open FinBot"
      >
        <MessageSquare className="w-6 h-6" />
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-[#0d1117] animate-pulse" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 w-96 bg-[#0d1117] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden transition-all flex flex-col ${isMinimized ? 'h-14' : 'h-[550px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              FinBot
              <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full font-normal">AI</span>
            </h3>
            <p className="text-[10px] text-blue-400/70">Powered by LLaMA</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Market Toggle */}
          <div className="flex items-center gap-0.5 bg-gray-800/50 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setMarket('US')}
              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                market === 'US' ? 'bg-blue-500/30 text-blue-400' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              US
            </button>
            <button
              onClick={() => setMarket('IN')}
              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                market === 'IN' ? 'bg-orange-500/30 text-orange-400' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              IN
            </button>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
          >
            {isMinimized ? <ChevronUp size={16} /> : <Minimize2 size={16} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: '300px', maxHeight: '350px' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-500/20 text-blue-100'
                      : msg.isError
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-gray-800/50 text-gray-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center gap-1 text-[10px] text-gray-500">
                      <span>Sources:</span>
                      {msg.sources.map((s, idx) => (
                        <span key={idx} className="bg-gray-700/50 px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800/50 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-gray-500">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-3 py-2 border-t border-gray-800/50 flex gap-2 overflow-x-auto scrollbar-hide">
            {['AAPL stance?', 'Why NVDA?', 'Changes today?', 'High conviction?'].map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="px-3 py-1 bg-gray-800/50 hover:bg-gray-700/50 text-xs text-gray-400 hover:text-gray-300 rounded-full whitespace-nowrap transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about any stock..."
                className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
