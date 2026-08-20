import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface StockSearchProps {
  onSearch: (ticker: string) => void;
  isLoading: boolean;
}

export const StockSearch: React.FC<StockSearchProps> = ({ onSearch, isLoading }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim());
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-12 text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Smarter Analysis. <br/>
            <span className="text-brand-500">Better Trades.</span>
        </h1>
        <p className="text-dark-muted text-lg max-w-lg mx-auto">
            Get instant, AI-powered intrinsic value reports for any public company using real-time financial data.
        </p>
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500 to-emerald-600 rounded-xl opacity-30 group-hover:opacity-60 blur transition duration-500"></div>
        <div className="relative flex items-center bg-dark-card rounded-xl border border-dark-border shadow-2xl overflow-hidden">
          <Search className="w-6 h-6 ml-4 text-dark-muted" />
          <input
            type="text"
            className="w-full bg-transparent border-none py-4 px-4 text-lg text-white placeholder-dark-muted focus:ring-0 focus:outline-none"
            placeholder="Enter symbol (e.g., AAPL, TSLA, MSFT)..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="mr-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Analyze'}
          </button>
        </div>
      </form>
      
      {!isLoading && (
         <div className="flex gap-3 justify-center text-sm text-dark-muted">
            <span>Trending:</span>
            <button onClick={() => onSearch("NVDA")} className="hover:text-brand-400 hover:underline">NVDA</button>
            <button onClick={() => onSearch("AMD")} className="hover:text-brand-400 hover:underline">AMD</button>
            <button onClick={() => onSearch("PLTR")} className="hover:text-brand-400 hover:underline">PLTR</button>
            <button onClick={() => onSearch("COIN")} className="hover:text-brand-400 hover:underline">COIN</button>
         </div>
      )}
    </div>
  );
};
