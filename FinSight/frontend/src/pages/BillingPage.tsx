import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check, Zap, Crown, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function BillingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-bloomberg-darker border-b border-bloomberg-border px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-bloomberg-border rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-bloomberg-text" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-bloomberg-text flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-bloomberg-accent" />
              Billing
            </h1>
            <p className="text-bloomberg-text-muted">Your plan and subscription</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Current Plan */}
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Free Plan</h2>
                <p className="text-bloomberg-text-muted">You're on the free plan - no payment required</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">$0</div>
              <div className="text-bloomberg-text-muted">forever</div>
            </div>
          </div>
        </div>

        {/* Plans */}
        <h2 className="text-lg font-bold text-white mb-4">Available Plans</h2>
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Free */}
          <div className="bg-bloomberg-darker rounded-xl border border-green-500/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-6 h-6 text-green-400" />
              <h3 className="text-lg font-bold text-white">Free</h3>
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">$0</span>
            </div>
            <ul className="space-y-2 mb-6">
              {[
                'Screener (900+ stocks)',
                'FinDash Dashboard',
                'Market Overview',
                'Basic Charts',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-bloomberg-text">
                  <Check className="w-4 h-4 text-green-400" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="w-full py-2 bg-green-500/20 text-green-400 rounded-lg font-medium">
              Current Plan
            </button>
          </div>

          {/* Pro */}
          <div className="bg-bloomberg-darker rounded-xl border border-bloomberg-accent p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-bloomberg-accent text-white text-xs px-3 py-1 rounded-full">
              Coming Soon
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-6 h-6 text-bloomberg-accent" />
              <h3 className="text-lg font-bold text-white">Pro</h3>
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">$19</span>
              <span className="text-bloomberg-text-muted">/mo</span>
            </div>
            <ul className="space-y-2 mb-6">
              {[
                'Everything in Free',
                'Hedge Fund Data',
                'Insider Trades',
                'AI Insights',
                'Price Alerts',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-bloomberg-text">
                  <Check className="w-4 h-4 text-bloomberg-accent" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="w-full py-2 bg-bloomberg-border text-bloomberg-text-muted rounded-lg font-medium cursor-not-allowed">
              Coming Soon
            </button>
          </div>

          {/* Enterprise */}
          <div className="bg-bloomberg-darker rounded-xl border border-bloomberg-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Enterprise</h3>
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">Custom</span>
            </div>
            <ul className="space-y-2 mb-6">
              {[
                'Everything in Pro',
                'API Access',
                'Custom Reports',
                'Dedicated Support',
                'SLA Guarantee',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-bloomberg-text">
                  <Check className="w-4 h-4 text-purple-400" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="w-full py-2 bg-bloomberg-border text-bloomberg-text rounded-lg font-medium hover:bg-bloomberg-dark">
              Contact Us
            </button>
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-bloomberg-darker rounded-xl border border-bloomberg-border p-6">
          <h2 className="text-lg font-bold text-white mb-4">FAQ</h2>
          <div className="space-y-4">
            <div className="p-4 bg-bloomberg-dark rounded-lg">
              <h3 className="text-white font-medium mb-1">Is the Free plan really free?</h3>
              <p className="text-bloomberg-text-muted text-sm">Yes! The Free plan is completely free with no hidden fees.</p>
            </div>
            <div className="p-4 bg-bloomberg-dark rounded-lg">
              <h3 className="text-white font-medium mb-1">When will Pro be available?</h3>
              <p className="text-bloomberg-text-muted text-sm">We're working on it! Join our newsletter to be notified.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
