import { ExternalLink, ArrowRight } from 'lucide-react'

/**
 * FinSight Page
 * 
 * This page provides access to the FinSight intelligence platform.
 * FinSight code is LOCKED and runs unchanged in apps/finsight/.
 * 
 * In a production setup, this would embed the FinSight frontend
 * or redirect to it. For now, we show launch instructions.
 */
export default function FinSightPage() {
  const handleLaunchFinSight = () => {
    // In production, this would navigate within the app or embed
    // For development, we open the FinSight frontend on port 5173
    window.open('http://localhost:5173', '_blank')
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">FinSight</h1>
        <p className="text-gray-400 mt-1">
          Intelligence Engine • Authority: LOCKED
        </p>
      </div>

      {/* Launch Card */}
      <div className="glass rounded-xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Launch FinSight</h2>
            <p className="text-gray-400 max-w-lg">
              FinSight is the decision authority. Access the full intelligence platform 
              with screener, stock analysis, and AI insights.
            </p>
          </div>
          <button
            onClick={handleLaunchFinSight}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium flex items-center gap-2 hover:from-green-600 hover:to-emerald-700 transition-all"
          >
            Open FinSight
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Development Instructions */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Development Setup</h3>
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">1. Start FinSight Backend:</p>
            <code className="text-green-400 font-mono text-sm block bg-black/30 p-3 rounded">
              cd apps/finsight/backend && python -m uvicorn app.main:app --reload --port 8000
            </code>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">2. Start FinSight Frontend:</p>
            <code className="text-green-400 font-mono text-sm block bg-black/30 p-3 rounded">
              cd apps/finsight/frontend && npm run dev
            </code>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">3. Access FinSight:</p>
            <code className="text-blue-400 font-mono text-sm block bg-black/30 p-3 rounded">
              http://localhost:5173
            </code>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Stock Screener</h3>
          <p className="text-gray-400 text-sm">
            Filter stocks by fundamentals, technicals, and momentum across US and India markets.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">9-Layer Intelligence</h3>
          <p className="text-gray-400 text-sm">
            Signal factory, regime engine, efficacy tracking, probability engine, and more.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">AI Insights</h3>
          <p className="text-gray-400 text-sm">
            LLM-powered analysis combining technicals, fundamentals, and news sentiment.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Portfolio Simulator</h3>
          <p className="text-gray-400 text-sm">
            Backtest strategies and simulate portfolio performance over historical data.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Top Opportunities</h3>
          <p className="text-gray-400 text-sm">
            Pre-computed INITIATE and AVOID lists updated daily by the intelligence pipeline.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Insider Flow</h3>
          <p className="text-gray-400 text-sm">
            SEC Form 4 and 13F data tracking insider and institutional trading activity.
          </p>
        </div>
      </div>
    </div>
  )
}

