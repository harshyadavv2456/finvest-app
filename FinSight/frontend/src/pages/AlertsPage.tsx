import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Plus, Trash2, TrendingUp, TrendingDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Alert {
  id: string;
  ticker: string;
  type: 'above' | 'below';
  price: number;
  created_at: string;
}

export default function AlertsPage() {
  const navigate = useNavigate();
  const { profile, isAuthenticated } = useAuth();
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newType, setNewType] = useState<'above' | 'below'>('above');
  const [newPrice, setNewPrice] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Load alerts from localStorage
  useEffect(() => {
    if (profile) {
      const key = `alerts_${profile.id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setAlerts(JSON.parse(saved));
      }
    }
  }, [profile]);

  // Save alerts to localStorage
  const saveAlerts = (newAlerts: Alert[]) => {
    if (profile) {
      localStorage.setItem(`alerts_${profile.id}`, JSON.stringify(newAlerts));
    }
    setAlerts(newAlerts);
  };

  const handleAddAlert = () => {
    if (!newTicker || !newPrice) return;

    const alert: Alert = {
      id: Date.now().toString(),
      ticker: newTicker.toUpperCase(),
      type: newType,
      price: parseFloat(newPrice),
      created_at: new Date().toISOString(),
    };

    saveAlerts([...alerts, alert]);
    setNewTicker('');
    setNewPrice('');
    setShowModal(false);
  };

  const handleDeleteAlert = (id: string) => {
    saveAlerts(alerts.filter(a => a.id !== id));
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-bloomberg-darker border-b border-bloomberg-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-bloomberg-border rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-bloomberg-text" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-bloomberg-text flex items-center gap-2">
                <Bell className="w-6 h-6 text-bloomberg-accent" />
                Price Alerts
              </h1>
              <p className="text-bloomberg-text-muted">Set alerts for price targets</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-bloomberg-accent to-cyan-500 text-white rounded-lg font-medium hover:opacity-90"
          >
            <Plus className="w-5 h-5" />
            New Alert
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        {/* Info Banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
          <p className="text-yellow-400 text-sm">
            <strong>Note:</strong> Alerts are saved locally. Real-time notifications coming soon!
          </p>
        </div>

        {/* Alerts List */}
        <div className="bg-bloomberg-darker rounded-xl border border-bloomberg-border overflow-hidden">
          {alerts.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="w-12 h-12 text-bloomberg-text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-bloomberg-text mb-2">No alerts yet</h3>
              <p className="text-bloomberg-text-muted mb-4">
                Create alerts to track when stocks hit your target prices.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-bloomberg-accent text-white rounded-lg hover:opacity-90"
              >
                Create First Alert
              </button>
            </div>
          ) : (
            <div className="divide-y divide-bloomberg-border">
              {alerts.map((alert) => (
                <div key={alert.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      alert.type === 'above' ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      {alert.type === 'above' ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-white">{alert.ticker}</span>
                      <div className="text-sm text-bloomberg-text-muted">
                        Alert when price goes {alert.type} ${alert.price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Alert Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bloomberg-darker border border-bloomberg-border rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-bloomberg-border">
              <h3 className="text-lg font-semibold text-white">Create Alert</h3>
              <button onClick={() => setShowModal(false)}>
                <X className="w-5 h-5 text-bloomberg-text-muted hover:text-white" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                  Stock Ticker
                </label>
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-bloomberg-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                  Condition
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewType('above')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      newType === 'above'
                        ? 'bg-green-500/20 text-green-400 border border-green-500'
                        : 'bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border'
                    }`}
                  >
                    Price Above
                  </button>
                  <button
                    onClick={() => setNewType('below')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      newType === 'below'
                        ? 'bg-red-500/20 text-red-400 border border-red-500'
                        : 'bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border'
                    }`}
                  >
                    Price Below
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                  Target Price ($)
                </label>
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="150.00"
                  step="0.01"
                  className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-bloomberg-accent"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-bloomberg-border">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-bloomberg-border text-bloomberg-text rounded-lg hover:bg-bloomberg-border"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAlert}
                disabled={!newTicker || !newPrice}
                className="flex-1 px-4 py-2 bg-bloomberg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
