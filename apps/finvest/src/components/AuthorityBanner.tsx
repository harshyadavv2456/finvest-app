import { Shield, TrendingUp, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

type AuthorityBadge = 'LOCKED' | 'WARNING' | 'ERROR'
type FindashBadge = 'LIVE' | 'OFFLINE' | 'DEGRADED'

interface AuthorityStatusData {
  finsight: {
    badge: AuthorityBadge;
    status: string;
    lastUpdated: string;
  };
  findash: {
    badge: FindashBadge;
    status: string;
    isOnline: boolean;
  };
  execution: 'DISABLED';
}

export default function AuthorityBanner() {
  const [status, setStatus] = useState<AuthorityStatusData>({
    finsight: {
      badge: 'LOCKED',
      status: 'Decisions Authority',
      lastUpdated: 'Loading...',
    },
    findash: {
      badge: 'OFFLINE',
      status: 'Market Data',
      isOnline: false,
    },
    execution: 'DISABLED',
  });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Check FinSight status
    const checkFinSight = async () => {
      try {
        const response = await fetch('/api/intelligence/status');
        if (response.ok) {
          const data = await response.json();
          setStatus(prev => ({
            ...prev,
            finsight: {
              badge: data.data_freshness?.is_fresh ? 'LOCKED' : 'WARNING',
              status: 'Decisions Authority',
              lastUpdated: data.last_updated || 'Unknown',
            },
          }));
        }
      } catch {
        // API not available - still show locked status
      }
    };

    // Check FinDash status
    const checkFinDash = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch('http://localhost:3000', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        setStatus(prev => ({
          ...prev,
          findash: {
            badge: 'LIVE',
            status: 'Market Data',
            isOnline: true,
          },
        }));
      } catch {
        setStatus(prev => ({
          ...prev,
          findash: {
            badge: 'OFFLINE',
            status: 'Market Data',
            isOnline: false,
          },
        }));
      }
    };

    checkFinSight();
    checkFinDash();
    
    const interval = setInterval(() => {
      checkFinSight();
      checkFinDash();
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const getFinsightStyles = () => {
    switch (status.finsight.badge) {
      case 'LOCKED':
        return { bg: 'bg-green-500/20', text: 'text-green-400', icon: Shield };
      case 'WARNING':
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: AlertTriangle };
      case 'ERROR':
        return { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle };
    }
  };

  const getFindashStyles = () => {
    switch (status.findash.badge) {
      case 'LIVE':
        return { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: CheckCircle };
      case 'DEGRADED':
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: AlertTriangle };
      case 'OFFLINE':
        return { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle };
    }
  };

  const finsightStyles = getFinsightStyles();
  const findashStyles = getFindashStyles();
  const FinsightIcon = finsightStyles.icon;
  const FindashIcon = findashStyles.icon;

  return (
    <div 
      className="bg-gray-900/80 border-b border-gray-800 cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        {/* Compact View */}
        <div className="flex items-center justify-center gap-6 text-sm">
          {/* FinSight Status */}
          <div className="flex items-center gap-2">
            <FinsightIcon className={`w-4 h-4 ${finsightStyles.text}`} />
            <span className="text-gray-400">FinSight</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono ${finsightStyles.bg} ${finsightStyles.text}`}>
              {status.finsight.badge}
            </span>
          </div>

          <span className="text-gray-700">|</span>

          {/* FinDash Status */}
          <div className="flex items-center gap-2">
            <FindashIcon className={`w-4 h-4 ${findashStyles.text}`} />
            <span className="text-gray-400">FinDash</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono ${findashStyles.bg} ${findashStyles.text}`}>
              {status.findash.badge}
            </span>
          </div>

          <span className="text-gray-700">|</span>

          {/* Execution Status */}
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">Execution</span>
            <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-500">
              DISABLED
            </span>
          </div>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="grid grid-cols-3 gap-6 text-center text-xs">
              {/* FinSight Details */}
              <div>
                <div className={`font-medium ${finsightStyles.text} mb-1`}>
                  FinSight — Decisions
                </div>
                <p className="text-gray-500">
                  9-layer intelligence pipeline
                </p>
                <p className="text-gray-600 mt-1">
                  Updated: {status.finsight.lastUpdated}
                </p>
              </div>

              {/* FinDash Details */}
              <div>
                <div className={`font-medium ${findashStyles.text} mb-1`}>
                  FinDash — Market Data
                </div>
                <p className="text-gray-500">
                  Real-time via yfinance
                </p>
                <p className="text-gray-600 mt-1">
                  Port: 3000
                </p>
              </div>

              {/* Execution Details */}
              <div>
                <div className="font-medium text-gray-500 mb-1">
                  Execution — Disabled
                </div>
                <p className="text-gray-500">
                  No broker APIs
                </p>
                <p className="text-gray-600 mt-1">
                  Read-only mode
                </p>
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-gray-600">
              FinSight = Decision Authority (LOCKED) • FinDash = Data Authority (LIVE) • FinVest = Orchestrator
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
