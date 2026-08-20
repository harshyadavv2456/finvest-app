import { ExternalLink, TrendingUp } from 'lucide-react'

/**
 * FinDash Page
 * 
 * This page provides access to the FinDash real-time dashboard.
 * FinDash code is LOCKED and runs unchanged in apps/findash/.
 * FinDash uses yfinance for real-time data and must continue to do so.
 * 
 * In a production setup, this would embed the FinDash frontend
 * or redirect to it. For now, we show launch instructions.
 */
export default function FinDashPage() {
  const handleLaunchFinDash = () => {
    // In production, this would navigate within the app or embed
    // For development, we open the FinDash frontend on port 5174
    window.open('http://localhost:5174', '_blank')
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">FinDash</h1>
        <p className="text-gray-400 mt-1">
          Real-Time Stock Dashboard • Powered by yfinance
        </p>
      </div>

      {/* Launch Card */}
      <div className="glass rounded-xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Launch FinDash</h2>
            <p className="text-gray-400 max-w-lg">
              FinDash provides real-time stock data, charting, and analysis tools 
              powered by Yahoo Finance data.
            </p>
          </div>
          <button
            onClick={handleLaunchFinDash}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium flex items-center gap-2 hover:from-blue-600 hover:to-indigo-700 transition-all"
          >
            Open FinDash
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Development Instructions */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Development Setup</h3>
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">1. Start FinDash:</p>
            <code className="text-green-400 font-mono text-sm block bg-black/30 p-3 rounded">
              cd apps/findash && npm run dev
            </code>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">2. Access FinDash:</p>
            <code className="text-blue-400 font-mono text-sm block bg-black/30 p-3 rounded">
              http://localhost:5174
            </code>
          </div>
        </div>
      </div>

      {/* Data Source Notice */}
      <div className="glass rounded-xl p-6 border border-blue-500/30 bg-blue-500/5">
        <div className="flex items-start gap-4">
          <TrendingUp className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-blue-400 mb-2">
              yfinance Data Provider
            </h3>
            <p className="text-gray-400">
              FinDash uses yfinance for real-time stock data. This includes live prices, 
              historical data, and company information. The yfinance dependency is 
              intentional and must not be changed.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Real-Time Charts</h3>
          <p className="text-gray-400 text-sm">
            Interactive candlestick charts with technical indicators and drawing tools.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Stock Comparison</h3>
          <p className="text-gray-400 text-sm">
            Compare multiple stocks side-by-side with synchronized charts.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Financial Health</h3>
          <p className="text-gray-400 text-sm">
            Comprehensive financial health analysis with key ratios and metrics.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">AI Analysis</h3>
          <p className="text-gray-400 text-sm">
            Gemini-powered stock analysis with investment recommendations.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Portfolio Tracking</h3>
          <p className="text-gray-400 text-sm">
            Track your portfolio performance with real-time P&L calculations.
          </p>
        </div>
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Price Alerts</h3>
          <p className="text-gray-400 text-sm">
            Set price alerts and get notified via Telegram when triggered.
          </p>
        </div>
      </div>
    </div>
  )
}

