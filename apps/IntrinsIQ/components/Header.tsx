import React from 'react';
import { BrainCircuit, Sparkles } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-dark-border bg-dark-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-500/10 rounded-lg">
            <BrainCircuit className="w-6 h-6 text-brand-500" />
          </div>
          <div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-emerald-500">
              IntrinsIQ
            </span>
            <span className="hidden sm:inline text-xs text-dark-muted ml-2">
              AI Value Investor
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs text-brand-400">
            <Sparkles className="w-3 h-3" />
            <span>Powered by Llama 3.3 70B</span>
          </div>
        </div>
      </div>
    </header>
  );
};
