import React, { useState } from 'react';
import { Header } from './components/Header';
import { StockSearch } from './components/StockSearch';
import { AnalysisResultView } from './components/AnalysisResultView';
import { analyzeStock } from './services/geminiService';
import { AppState, FullAnalysisResponse } from './types';
import { AlertCircle, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [data, setData] = useState<FullAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (ticker: string) => {
    setState(AppState.ANALYZING);
    setError(null);
    setData(null);

    try {
      const result = await analyzeStock(ticker);
      if (!result.analysis) {
        throw new Error("Could not parse analysis data. The AI response might have been unstructured.");
      }
      setData(result);
      setState(AppState.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during analysis.");
      setState(AppState.ERROR);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col font-sans selection:bg-brand-500/30">
      <Header />
      
      <main className="flex-grow flex flex-col relative overflow-hidden">
         {/* Background Decoration */}
         {state === AppState.IDLE && (
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-500/5 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/5 rounded-full blur-[120px]"></div>
            </div>
         )}

         <div className="z-10 w-full">
            {state === AppState.IDLE && (
                <div className="min-h-[80vh] flex flex-col justify-center items-center px-4">
                    <StockSearch onSearch={handleSearch} isLoading={false} />
                    
                    <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl text-center">
                        <FeatureCard 
                            title="Llama 3.3 70B" 
                            desc="Deep analysis powered by Meta's most capable open-source model via Groq." 
                        />
                        <FeatureCard 
                            title="Live Data" 
                            desc="Real-time stock prices and financials directly from Yahoo Finance API." 
                        />
                        <FeatureCard 
                            title="Intrinsic Math" 
                            desc="Automated DCF and Graham Number calculations for objective value assessment." 
                        />
                    </div>
                </div>
            )}

            {state === AppState.ANALYZING && (
                <div className="min-h-[80vh] flex flex-col justify-center items-center px-4 space-y-6 animate-fade-in">
                    <div className="relative">
                        <div className="absolute inset-0 bg-brand-500 blur-xl opacity-20 animate-pulse"></div>
                        <Loader2 className="w-16 h-16 text-brand-500 animate-spin relative z-10" />
                    </div>
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold text-white">Analyzing Market Data...</h2>
                        <p className="text-dark-muted">Reading 10-Ks, Analyst Reports, and Calculating DCF...</p>
                        <p className="text-xs text-dark-muted/50 font-mono pt-4">This usually takes about 10-15 seconds for deep reasoning.</p>
                    </div>
                </div>
            )}

            {state === AppState.ERROR && (
                <div className="min-h-[60vh] flex flex-col justify-center items-center px-4">
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

            {state === AppState.SUCCESS && data && data.analysis && (
                <div className="animate-fade-in-up">
                    <div className="max-w-7xl mx-auto px-4 pt-6">
                        <button 
                            onClick={() => setState(AppState.IDLE)} 
                            className="text-sm text-dark-muted hover:text-white flex items-center gap-2 mb-4"
                        >
                            ← Back to Search
                        </button>
                    </div>
                    <AnalysisResultView data={data.analysis} sources={data.groundingSources} />
                </div>
            )}
         </div>
      </main>

      <footer className="border-t border-dark-border py-8 mt-auto bg-dark-bg">
        <div className="max-w-7xl mx-auto px-4 text-center text-dark-muted text-sm">
            <p>&copy; {new Date().getFullYear()} IntrinsIQ. Powered by Llama 3.3 70B + Yahoo Finance.</p>
            <p className="text-xs mt-2 opacity-50">Not financial advice. For educational purposes only.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ title, desc }: { title: string, desc: string }) => (
    <div className="p-6 rounded-2xl bg-dark-card border border-dark-border/50 hover:border-brand-500/30 transition-colors">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-dark-muted">{desc}</p>
    </div>
);

export default App;
