import { Plane, Shield, Lock, AlertTriangle } from 'lucide-react'

export default function PilotPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">AI Pilot</h1>
        <p className="text-gray-400 mt-1">
          Automated portfolio management (Coming Soon)
        </p>
      </div>

      {/* Disabled State */}
      <div className="glass rounded-xl p-12 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-6">
          <Plane className="w-10 h-10 text-gray-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">Pilot Mode Disabled</h2>
        
        <p className="text-gray-400 max-w-lg mx-auto mb-8">
          The AI Pilot feature is currently disabled. This feature will enable automated 
          portfolio management powered by FinSight intelligence decisions.
        </p>

        <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span>No Execution</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" />
            <span>Authority: LOCKED</span>
          </div>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="glass rounded-xl p-6 border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-amber-400 mb-2">
              No Broker APIs • No Order Placement • No Auto Trading
            </h3>
            <p className="text-gray-400">
              FinVest does not and will never execute trades automatically. The AI Pilot 
              feature, when enabled, will only provide recommendations and portfolio 
              suggestions based on FinSight intelligence. All execution decisions remain 
              with the user.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Preview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6 opacity-50">
          <h3 className="text-lg font-semibold text-white mb-2">Portfolio Suggestions</h3>
          <p className="text-gray-400 text-sm">
            Get AI-generated portfolio allocation suggestions based on FinSight INITIATE signals.
          </p>
        </div>
        <div className="glass rounded-xl p-6 opacity-50">
          <h3 className="text-lg font-semibold text-white mb-2">Rebalancing Alerts</h3>
          <p className="text-gray-400 text-sm">
            Receive notifications when positions should be adjusted based on regime changes.
          </p>
        </div>
        <div className="glass rounded-xl p-6 opacity-50">
          <h3 className="text-lg font-semibold text-white mb-2">Risk Monitoring</h3>
          <p className="text-gray-400 text-sm">
            Track portfolio risk metrics and get warnings when thresholds are exceeded.
          </p>
        </div>
      </div>
    </div>
  )
}

