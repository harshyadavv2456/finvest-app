import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  AlertTriangle,
  ArrowRight,
  Clock,
  Globe
} from 'lucide-react'

interface MarketStatus {
  status: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS'
  stockCount: number
}

interface DashboardData {
  authority: 'LOCKED'
  lastUpdated: string
  markets: {
    US: MarketStatus
    IN: MarketStatus
  }
  initiateCount: number
  avoidCount: number
  totalStocks: number
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Try to fetch from intelligence status API
        const response = await fetch('/api/intelligence/status')
        if (response.ok) {
          const apiData = await response.json()
          setData({
            authority: 'LOCKED',
            lastUpdated: apiData.last_updated || 'Unknown',
            markets: {
              US: { 
                status: apiData.markets?.US?.status || 'CLOSED',
                stockCount: apiData.markets?.US?.stocks_available || 0,
              },
              IN: { 
                status: apiData.markets?.IN?.status || 'CLOSED',
                stockCount: apiData.markets?.IN?.stocks_available || 0,
              },
            },
            initiateCount: 0,
            avoidCount: 0,
            totalStocks: (apiData.markets?.US?.stocks_available || 0) + (apiData.markets?.IN?.stocks_available || 0),
          })
        } else {
          throw new Error('API unavailable')
        }
      } catch {
        // Fallback to mock data for development
        setData({
          authority: 'LOCKED',
          lastUpdated: new Date().toISOString(),
          markets: {
            US: { status: 'CLOSED', stockCount: 500 },
            IN: { status: 'CLOSED', stockCount: 200 },
          },
          initiateCount: 45,
          avoidCount: 23,
          totalStocks: 700,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'text-green-400'
      case 'CLOSED': return 'text-red-400'
      case 'PRE_MARKET': return 'text-amber-400'
      case 'AFTER_HOURS': return 'text-orange-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'OPEN': return '🟢'
      case 'CLOSED': return '🔴'
      case 'PRE_MARKET': return '🟡'
      case 'AFTER_HOURS': return '🟠'
      default: return '⚪'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading FinSight intelligence...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          FinVest Financial Operating System Overview
        </p>
      </div>

      {/* Authority Status Card */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">FinSight Authority</h2>
              <p className="text-sm text-gray-400">
                Decision engine status
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 font-mono text-sm border border-green-500/30">
              <Shield className="w-4 h-4" />
              LOCKED
            </span>
            <p className="text-xs text-gray-500 mt-2 flex items-center justify-end gap-1">
              <Clock className="w-3 h-3" />
              Updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Market Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* US Market */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">US Market</h3>
            <span className={`text-sm ${getStatusColor(data?.markets.US.status || 'CLOSED')}`}>
              {getStatusEmoji(data?.markets.US.status || 'CLOSED')} {data?.markets.US.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-400">Stocks Analyzed</p>
              <p className="text-2xl font-bold text-white">{data?.markets.US.stockCount || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-400">Intelligence</p>
              <p className="text-sm text-green-400 mt-1">Available</p>
            </div>
          </div>
        </div>

        {/* IN Market */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-white">India Market</h3>
            <span className={`text-sm ${getStatusColor(data?.markets.IN.status || 'CLOSED')}`}>
              {getStatusEmoji(data?.markets.IN.status || 'CLOSED')} {data?.markets.IN.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-400">Stocks Analyzed</p>
              <p className="text-2xl font-bold text-white">{data?.markets.IN.stockCount || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-400">Intelligence</p>
              <p className="text-sm text-green-400 mt-1">Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* INITIATE Count */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">INITIATE Signals</p>
              <p className="text-2xl font-bold text-green-400">{data?.initiateCount || '—'}</p>
            </div>
          </div>
          <Link 
            to="/intelligence?filter=initiate" 
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-green-400 mt-4 transition-colors"
          >
            View opportunities <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* AVOID Count */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">AVOID Signals</p>
              <p className="text-2xl font-bold text-red-400">{data?.avoidCount || '—'}</p>
            </div>
          </div>
          <Link 
            to="/intelligence?filter=avoid" 
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-400 mt-4 transition-colors"
          >
            View avoid list <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Total Stocks */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Coverage</p>
              <p className="text-2xl font-bold text-blue-400">{data?.totalStocks || 0}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Across US + India markets
          </p>
        </div>
      </div>

      {/* Pilot CTA - Disabled */}
      <div className="glass rounded-xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white mb-2">AI Pilot</h3>
            <p className="text-gray-400 max-w-lg">
              Automated portfolio management powered by FinSight intelligence.
              Execute decisions with confidence.
            </p>
          </div>
          <button
            disabled
            className="px-6 py-3 rounded-lg bg-gray-800 text-gray-500 cursor-not-allowed flex items-center gap-2"
          >
            <span>Open Pilot</span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-500">Coming Soon</span>
          </button>
        </div>
      </div>
    </div>
  )
}

