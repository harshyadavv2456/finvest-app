/**
 * AUTH CALLBACK - PUBLIC MODE
 * No Supabase, just redirect to home.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Public mode: just redirect to home
    console.warn('Auth disabled - running in PUBLIC MODE');
    const timer = setTimeout(() => navigate('/'), 1500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Info className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Public Mode</h2>
        <p className="text-bloomberg-text-muted mb-6">
          Authentication is disabled. Redirecting to dashboard...
        </p>
      </div>
    </div>
  );
}
