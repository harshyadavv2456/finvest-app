import { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  ExternalLink, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface FindashStatus {
  isOnline: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  lastCheck: string;
}

/**
 * Markets Page
 * 
 * Embeds FinDash for real-time market data.
 * FinDash is the DATA AUTHORITY.
 * 
 * Options:
 * 1. iframe embed of FinDash frontend (safest)
 * 2. Link to open FinDash in new tab
 */
export default function MarketsPage() {
  const [findashStatus, setFindashStatus] = useState<FindashStatus>({
    isOnline: false,
    status: 'OFFLINE',
    lastCheck: new Date().toISOString(),
  });
  const [checking, setChecking] = useState(true);
  const [embedMode, setEmbedMode] = useState<'iframe' | 'link'>('iframe');

  const FINDASH_URL = 'http://localhost:3000';

  const checkFindashStatus = async () => {
    setChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(FINDASH_URL, {
        method: 'HEAD',
        mode: 'no-cors', // Allow checking even with CORS restrictions
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // no-cors mode always returns opaque response, so we assume success if no error
      setFindashStatus({
        isOnline: true,
        status: 'ONLINE',
        lastCheck: new Date().toISOString(),
      });
    } catch (error) {
      setFindashStatus({
        isOnline: false,
        status: 'OFFLINE',
        lastCheck: new Date().toISOString(),
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkFindashStatus();
    // Check every 30 seconds
    const interval = setInterval(checkFindashStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenFinDash = () => {
    window.open(FINDASH_URL, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-400" />
            Markets
          </h1>
          <p className="text-gray-400 mt-1">
            Real-time market data powered by FinDash • yfinance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
            findashStatus.isOnline 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {findashStatus.isOnline ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {findashStatus.status}
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={checkFindashStatus}
            disabled={checking}
            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${checking ? 'animate-spin' : ''}`} />
          </button>

          {/* Open External Button */}
          <button
            onClick={handleOpenFinDash}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open FinDash
          </button>
        </div>
      </div>

      {/* Data Source Info */}
      <div className="glass rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-medium">Data Source: FinDash</h3>
            <p className="text-sm text-gray-400">
              Real-time stock data via Yahoo Finance (yfinance)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">
            Authority: <span className="text-blue-400 font-mono">LIVE</span>
          </span>
          <span className="text-xs text-gray-500">
            Port: <span className="text-gray-300 font-mono">3000</span>
          </span>
        </div>
      </div>

      {/* Offline Warning */}
      {!findashStatus.isOnline && (
        <div className="glass rounded-xl p-6 border border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-red-400 mb-2">
                FinDash is Offline
              </h3>
              <p className="text-gray-400 mb-4">
                Cannot display market data. Start FinDash to enable real-time data.
              </p>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-2">Start FinDash:</p>
                <code className="text-green-400 font-mono text-sm block bg-black/30 p-3 rounded">
                  cd apps/findash/FinDash && npm run dev
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embed Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setEmbedMode('iframe')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            embedMode === 'iframe'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Embedded View
        </button>
        <button
          onClick={() => setEmbedMode('link')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            embedMode === 'link'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          External Link
        </button>
      </div>

      {/* Main Content */}
      {embedMode === 'iframe' ? (
        <div className="glass rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 350px)', minHeight: '500px' }}>
          {findashStatus.isOnline ? (
            <iframe
              src={FINDASH_URL}
              className="w-full h-full border-0"
              title="FinDash - Real-time Stock Dashboard"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <XCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">FinDash is offline</p>
                <p className="text-gray-500 text-sm mt-2">Start FinDash on port 3000</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass rounded-xl p-12 text-center">
          <TrendingUp className="w-16 h-16 text-blue-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-4">FinDash External</h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Open FinDash in a separate browser tab for the full experience
            with all features and real-time data.
          </p>
          <button
            onClick={handleOpenFinDash}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium text-lg flex items-center gap-3 mx-auto hover:from-blue-600 hover:to-indigo-700 transition-all"
          >
            Open FinDash
            <ExternalLink className="w-5 h-5" />
          </button>
          <p className="text-gray-500 text-sm mt-6">
            URL: {FINDASH_URL}
          </p>
        </div>
      )}

      {/* Authority Footer */}
      <div className="text-center text-sm text-gray-500">
        <p>
          FinDash is the DATA AUTHORITY • Charts and indicators computed by FinDash
        </p>
        <p className="mt-1 text-xs text-gray-600">
          FinVest never computes indicators. FinVest never duplicates data pipelines.
        </p>
      </div>
    </div>
  )
}

