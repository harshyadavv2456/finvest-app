/**
 * DataNotAvailable Component
 * Shows explicit "Not Available" when data is missing
 * 
 * Distinguishes between:
 * ❌ NOT_SUPPORTED - Feature not available for this market
 * ⏳ NOT_PROCESSED - Pipeline hasn't run yet  
 * ⚠️ FILTERED - Data was filtered out (not an error)
 * 🔴 PIPELINE_DOWN / TIMEOUT / NETWORK_ERROR - Actual failures
 * 
 * NO silent fallbacks - always explicit.
 */

import { AlertCircle, RefreshCw, Clock, Ban, Filter, WifiOff, ServerCrash } from 'lucide-react';
import { DataStatus, StatusReason } from '../core/DataCore';

interface DataNotAvailableProps {
  source: string;
  status: DataStatus;
  statusReason?: StatusReason;
  error?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

// Get appropriate icon and color for status reason
const getStatusDisplay = (statusReason?: StatusReason) => {
  switch (statusReason) {
    case 'NOT_SUPPORTED':
      return {
        icon: Ban,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20',
        label: 'Not Supported',
        description: 'This feature is not available for this market.',
        canRetry: false,
      };
    case 'NOT_PROCESSED':
      return {
        icon: Clock,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        label: 'Not Yet Processed',
        description: 'Pipeline has not processed this data yet.',
        canRetry: true,
      };
    case 'FILTERED':
      return {
        icon: Filter,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        label: 'Filtered Out',
        description: 'Data exists but was filtered based on current criteria.',
        canRetry: false,
      };
    case 'TIMEOUT':
      return {
        icon: Clock,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        label: 'Request Timeout',
        description: 'Request took too long. Server may be warming up.',
        canRetry: true,
      };
    case 'NETWORK_ERROR':
      return {
        icon: WifiOff,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        label: 'Network Error',
        description: 'Could not connect to the server.',
        canRetry: true,
      };
    case 'PIPELINE_DOWN':
      return {
        icon: ServerCrash,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        label: 'Pipeline Error',
        description: 'Backend data pipeline encountered an error.',
        canRetry: true,
      };
    case 'NO_DATA':
      return {
        icon: AlertCircle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20',
        label: 'No Data',
        description: 'No data available for this query.',
        canRetry: false,
      };
    case 'STALE':
      return {
        icon: Clock,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        label: 'Stale Data',
        description: 'Data is older than expected.',
        canRetry: true,
      };
    default:
      return {
        icon: AlertCircle,
        color: 'text-gray-400',
        bgColor: 'bg-gray-500/20',
        label: 'Unavailable',
        description: 'Data is currently unavailable.',
        canRetry: true,
      };
  }
};

export default function DataNotAvailable({ 
  source, 
  status, 
  statusReason,
  error, 
  onRetry, 
  compact = false 
}: DataNotAvailableProps) {
  const display = getStatusDisplay(statusReason);
  const Icon = display.icon;
  
  if (compact) {
    return (
      <div className="flex items-center justify-center py-4 px-3 bg-gray-800/30 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500">
          {status === 'loading' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <Icon className={`w-4 h-4 ${display.color}`} />
          )}
          <span className="text-xs">
            {status === 'loading' ? `Loading ${source}...` : display.label}
          </span>
          {onRetry && status !== 'loading' && display.canRetry && (
            <button 
              onClick={onRetry}
              className="p-1 hover:bg-gray-700 rounded"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
        status === 'loading' ? 'bg-blue-500/20' : display.bgColor
      }`}>
        {status === 'loading' ? (
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
        ) : (
          <Icon className={`w-6 h-6 ${display.color}`} />
        )}
      </div>
      
      <h3 className="text-sm font-medium text-gray-300 mb-1">
        {status === 'loading' ? `Loading ${source}` : `${source}: ${display.label}`}
      </h3>
      
      <p className="text-xs text-gray-500 mb-3 text-center max-w-xs">
        {status === 'loading' ? 'Please wait...' : display.description}
      </p>
      
      {error && status === 'failed' && (
        <p className="text-xs text-red-400/80 mb-3 text-center max-w-xs font-mono">
          {error}
        </p>
      )}
      
      {onRetry && status !== 'loading' && display.canRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

/**
 * Inline placeholder for when data is loading/unavailable
 */
export function DataPlaceholder({ 
  status,
  text = 'Not Available'
}: { 
  status: DataStatus;
  text?: string;
}) {
  if (status === 'loading') {
    return <span className="text-gray-500 animate-pulse">Loading...</span>;
  }
  if (status === 'failed' || status === 'idle') {
    return <span className="text-gray-500">{text}</span>;
  }
  return null;
}

