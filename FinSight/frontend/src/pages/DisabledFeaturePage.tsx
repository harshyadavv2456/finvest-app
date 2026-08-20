/**
 * DisabledFeaturePage - Placeholder for features under development
 * 
 * Used for:
 * - AI Pilot (until DataCore stable)
 * - Execution (until PortfolioCore + DataCore stable)
 * - FinBot (until engines complete)
 */

import { useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, AlertTriangle, Clock, Server } from 'lucide-react';

interface DisabledFeaturePageProps {
  feature: string;
  reason?: string;
}

export default function DisabledFeaturePage({ 
  feature = 'This feature',
  reason = 'This feature is temporarily disabled while we stabilize core systems.'
}: DisabledFeaturePageProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6">
      {/* Status Icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center border border-gray-700">
          <Lock className="w-10 h-10 text-gray-500" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center border border-amber-500/30">
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-white mb-3">{feature}</h1>
      <div className="flex items-center gap-2 mb-6">
        <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-sm font-medium rounded-full border border-amber-500/30">
          Temporarily Disabled
        </span>
      </div>

      {/* Reason */}
      <div className="max-w-md text-center mb-8">
        <p className="text-gray-400">{reason}</p>
      </div>

      {/* Status Box */}
      <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-6 max-w-md w-full mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-white">System Status</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">DataCore</span>
            <span className="text-sm text-green-400">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">PortfolioCore</span>
            <span className="text-sm text-green-400">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">TaxEngine</span>
            <span className="text-sm text-green-400">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">CapitalAllocator</span>
            <span className="text-sm text-green-400">Operational</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{feature}</span>
            <span className="text-sm text-amber-400">Pending</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Dashboard
        </button>
      </div>

      {/* Note */}
      <div className="mt-12 flex items-start gap-3 max-w-md text-center">
        <AlertTriangle className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">
          FinVest is being rebuilt as a deterministic financial operating system. 
          Intelligence features will be re-enabled once core data pipelines are verified stable.
        </p>
      </div>
    </div>
  );
}
