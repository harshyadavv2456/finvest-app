import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  AlertTriangle,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react'

interface Opportunity {
  ticker: string
  company_name: string
  intent: 'INITIATE' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'AVOID'
  probability: number
  confidence: number
  regime: string
  current_price: number | null
  change_1d: number | null
  sector: string | null
}

interface IntelligenceData {
  market: string
  generated_at: string
  total_stocks: number
  initiate_candidates: number
  avoid_candidates: number
  opportunities: Opportunity[]
  avoid_list: Opportunity[]
}

export default function IntelligencePage() {
  const { market = 'US' } = useParams()
  const [data, setData] = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'opportunities' | 'avoid'>('opportunities')
  const [selectedMarket, setSelectedMarket] = useState(market.toUpperCase())

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/intelligence/top-opportunities/${selectedMarket}`)
        if (response.ok) {
          const apiData = await response.json()
          setData(apiData)
        } else {
          throw new Error('Intelligence data not available')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load intelligence')
        // Set mock data for development
        setData({
          market: selectedMarket,
          generated_at: new Date().toISOString(),
          total_stocks: 500,
          initiate_candidates: 45,
          avoid_candidates: 23,
          opportunities: [
            { ticker: 'NVDA', company_name: 'NVIDIA Corporation', intent: 'INITIATE', probability: 78, confidence: 85, regime: 'BULL', current_price: 875.50, change_1d: 2.3, sector: 'Technology' },
            { ticker: 'AAPL', company_name: 'Apple Inc.', intent: 'INITIATE', probability: 72, confidence: 80, regime: 'BULL', current_price: 182.30, change_1d: 0.8, sector: 'Technology' },
            { ticker: 'MSFT', company_name: 'Microsoft Corporation', intent: 'ACCUMULATE', probability: 68, confidence: 78, regime: 'BULL', current_price: 378.45, change_1d: 1.2, sector: 'Technology' },
          ],
          avoid_list: [
            { ticker: 'XYZ', company_name: 'Example Corp', intent: 'AVOID', probability: 25, confidence: 82, regime: 'BEAR', current_price: 12.50, change_1d: -5.2, sector: 'Consumer' },
          ],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedMarket])

  const getIntentBadge = (intent: string) => {
    const styles: Record<string, string> = {
      INITIATE: 'intent-initiate',
      ACCUMULATE: 'intent-accumulate',
      HOLD: 'intent-hold',
      REDUCE: 'intent-reduce',
      AVOID: 'intent-avoid',
    }
    return styles[intent] || 'intent-hold'
  }

  const filteredData = activeTab === 'opportunities' 
    ? (data?.opportunities || []).filter(o => 
        o.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.company_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : (data?.avoid_list || []).filter(o => 
        o.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.company_name.toLowerCase().includes(searchTerm.toLowerCase())
      )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading FinSight intelligence...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Intelligence</h1>
          <p className="text-gray-400 mt-1">
            FinSight decision signals • Authority: LOCKED
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-green-500"
          >
            <option value="US">🇺🇸 US Market</option>
            <option value="IN">🇮🇳 India Market</option>
          </select>
        </div>
      </div>

      {/* Error Warning */}
      {error && (
        <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-amber-400">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Shield className="w-4 h-4" />
            Authority
          </div>
          <p className="text-xl font-bold text-green-400">LOCKED</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-1">Total Analyzed</p>
          <p className="text-xl font-bold text-white">{data?.total_stocks || 0}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            INITIATE
          </div>
          <p className="text-xl font-bold text-green-400">{data?.initiate_candidates || 0}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            AVOID
          </div>
          <p className="text-xl font-bold text-red-400">{data?.avoid_candidates || 0}</p>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'opportunities'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Opportunities ({data?.opportunities?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('avoid')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'avoid'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingDown className="w-4 h-4 inline mr-2" />
            Avoid List ({data?.avoid_list?.length || 0})
          </button>
        </div>
        
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search ticker or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 w-64"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Ticker</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Company</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Intent</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Probability</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Confidence</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Regime</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">Price</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-gray-400">1D Change</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item) => (
              <tr key={item.ticker} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-mono font-medium text-white">{item.ticker}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-gray-300">{item.company_name}</span>
                  {item.sector && (
                    <span className="text-xs text-gray-500 block">{item.sector}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getIntentBadge(item.intent)}`}>
                    {item.intent}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-white font-medium">{item.probability}%</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-gray-400">{item.confidence}%</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-sm ${
                    item.regime === 'BULL' ? 'text-green-400' :
                    item.regime === 'BEAR' ? 'text-red-400' :
                    'text-gray-400'
                  }`}>
                    {item.regime}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-white font-mono">
                    {item.current_price ? `$${item.current_price.toFixed(2)}` : '—'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {item.change_1d !== null ? (
                    <span className={item.change_1d >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {item.change_1d >= 0 ? '+' : ''}{item.change_1d.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredData.length === 0 && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500">No results found</p>
          </div>
        )}
      </div>

      {/* Authority Footer */}
      <div className="text-center text-sm text-gray-500">
        <p>
          Data generated: {data?.generated_at ? new Date(data.generated_at).toLocaleString() : 'Unknown'}
        </p>
        <p className="mt-1 flex items-center justify-center gap-2">
          <Shield className="w-4 h-4 text-green-500" />
          FinSight decisions are authoritative and LOCKED
        </p>
      </div>
    </div>
  )
}

