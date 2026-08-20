/**
 * AUTH PAGE - PUBLIC MODE
 * No login required, just redirect to home.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Info } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Public mode: auto-redirect after showing message
    console.warn('Auth disabled - running in PUBLIC MODE');
    const timer = setTimeout(() => navigate('/'), 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-bloomberg-accent to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-bloomberg-accent/30">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-white">FinVest</h1>
            <p className="text-bloomberg-text-muted text-sm">Financial OS</p>
          </div>
        </div>

        {/* Public Mode Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-left">
            <p className="text-yellow-400 font-medium">Public Mode Active</p>
            <p className="text-yellow-400/80 text-sm">Authentication is disabled. Full access granted.</p>
          </div>
        </div>

        <h2 className="text-xl font-bold text-white mb-3">Welcome!</h2>
        <p className="text-bloomberg-text-muted mb-6">
          Redirecting to dashboard...
        </p>

        <div className="w-8 h-8 border-4 border-bloomberg-accent/30 border-t-bloomberg-accent rounded-full animate-spin mx-auto mb-4" />

        <button
          onClick={() => navigate('/')}
          className="w-full bg-gradient-to-r from-bloomberg-accent to-cyan-500 text-white font-semibold py-3 px-6 rounded-xl hover:opacity-90 transition-all mt-4"
        >
          Continue to Dashboard →
        </button>
      </div>
    </div>
  );
}
