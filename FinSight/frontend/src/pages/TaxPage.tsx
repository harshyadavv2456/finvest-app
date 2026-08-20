/**
 * TaxPage - Tax Analysis View
 * 
 * RULES:
 * - NO mock data
 * - NO manual calculations on fake holdings
 * - Shows explicit "unavailable" state when no demat connected
 * - Only computes taxes from real demat data
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, 
  TrendingUp, 
  ArrowLeft,
  AlertTriangle,
  Info,
  Wallet,
  ChevronRight,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { usePortfolioCore } from '../core/PortfolioCore';
import { TaxEngine, TAX_CONFIG, TaxComputationResult } from '../engines/TaxEngine';

// =============================================================================
// NO DEMAT STATE
// =============================================================================

function TaxUnavailable({ onNavigateToPortfolio }: { onNavigateToPortfolio: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-full bg-gray-800/50 flex items-center justify-center mb-6">
        <Calculator size={40} className="text-gray-500" />
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-3">
        Tax Analysis Unavailable
      </h2>
      
      <p className="text-gray-400 text-center max-w-md mb-2">
        Connect your demat account to see tax calculations on your actual holdings.
      </p>
      
      <p className="text-gray-500 text-sm text-center max-w-md mb-8">
        <strong>No mock data.</strong> Tax analysis requires real portfolio data from a connected broker.
      </p>
      
      <button
        onClick={onNavigateToPortfolio}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
      >
        <Wallet size={20} />
        Connect Demat Account
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// =============================================================================
// TAX INFO PANEL
// =============================================================================

function TaxInfoPanel() {
  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-blue-400 font-medium mb-1">FY 2024-25 Tax Rates</h4>
          <div className="text-gray-400 text-sm space-y-1">
            <p>
              <strong>STCG (Short-term):</strong> {(TAX_CONFIG.STCG_RATE * 100).toFixed(0)}% 
              on gains from stocks held less than 12 months
            </p>
            <p>
              <strong>LTCG (Long-term):</strong> {(TAX_CONFIG.LTCG_RATE * 100).toFixed(1)}% 
              on gains above ₹{(TAX_CONFIG.LTCG_EXEMPTION / 100000).toFixed(2)} lakh exemption
            </p>
            <p>
              <strong>Cess:</strong> {(TAX_CONFIG.CESS_RATE * 100).toFixed(0)}% 
              health and education cess on total tax
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TAX SUMMARY CARDS
// =============================================================================

function TaxSummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<any>;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
}) {
  const colorClasses = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    gray: 'bg-gray-500/10 border-gray-500/30 text-gray-400',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color].split(' ').slice(0, 2).join(' ')}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className={colorClasses[color].split(' ')[2]} />
        <span className="text-gray-400 text-sm">{title}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color].split(' ')[2]}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-gray-500 text-xs mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// =============================================================================
// TAX BREAKDOWN TABLE
// =============================================================================

function TaxBreakdownTable({ result }: { result: TaxComputationResult }) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const dematSummaries = Object.values(result.byDemat);

  if (dematSummaries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No holdings to analyze
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-gray-400 text-sm border-b border-gray-800">
            <th className="text-left py-3 px-4">Account</th>
            <th className="text-right py-3 px-4">STCG</th>
            <th className="text-right py-3 px-4">STCG Tax</th>
            <th className="text-right py-3 px-4">LTCG</th>
            <th className="text-right py-3 px-4">Exemption Used</th>
            <th className="text-right py-3 px-4">LTCG Tax</th>
            <th className="text-right py-3 px-4">Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {dematSummaries.map((demat) => (
            <tr 
              key={demat.accountId}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className="py-3 px-4">
                <span className="text-white font-medium">{demat.accountName}</span>
                <div className="text-gray-500 text-xs">{demat.lots.length} lots</div>
              </td>
              <td className={`text-right py-3 px-4 ${
                demat.stcgNetTaxable > 0 ? 'text-green-400' : 
                demat.stcgLosses > 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {formatCurrency(demat.stcgGains - demat.stcgLosses)}
              </td>
              <td className="text-right py-3 px-4 text-yellow-400">
                {formatCurrency(demat.stcgTax)}
              </td>
              <td className={`text-right py-3 px-4 ${
                demat.ltcgNetTaxable > 0 ? 'text-green-400' : 
                demat.ltcgLosses > 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {formatCurrency(demat.ltcgGains - demat.ltcgLosses)}
              </td>
              <td className="text-right py-3 px-4 text-blue-400">
                {formatCurrency(demat.ltcgExemptionUsed)}
              </td>
              <td className="text-right py-3 px-4 text-yellow-400">
                {formatCurrency(demat.ltcgTax)}
              </td>
              <td className="text-right py-3 px-4 text-red-400 font-medium">
                {formatCurrency(demat.totalTax)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-800/50 font-medium">
            <td className="py-3 px-4 text-white">Total</td>
            <td className={`text-right py-3 px-4 ${
              result.totals.stcgGains - result.totals.stcgLosses > 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatCurrency(result.totals.stcgGains - result.totals.stcgLosses)}
            </td>
            <td className="text-right py-3 px-4 text-yellow-400">
              {formatCurrency(result.totals.stcgTax)}
            </td>
            <td className={`text-right py-3 px-4 ${
              result.totals.ltcgGains - result.totals.ltcgLosses > 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatCurrency(result.totals.ltcgGains - result.totals.ltcgLosses)}
            </td>
            <td className="text-right py-3 px-4 text-blue-400">
              {formatCurrency(result.totals.ltcgExemptionUsed)}
            </td>
            <td className="text-right py-3 px-4 text-yellow-400">
              {formatCurrency(result.totals.ltcgTax)}
            </td>
            <td className="text-right py-3 px-4 text-red-400">
              {formatCurrency(result.totals.totalTax)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// =============================================================================
// WARNINGS PANEL
// =============================================================================

function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-yellow-400 font-medium mb-2">Warnings</h4>
          <ul className="text-gray-400 text-sm space-y-1">
            {warnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// RECOMMENDATION PANEL
// =============================================================================

function RecommendationPanel({ result }: { result: TaxComputationResult }) {
  const { recommendation, totals } = result;

  if (!recommendation.optimalDematForSale) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4 mb-6">
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
        <CheckCircle size={18} className="text-green-400" />
        Tax Optimization
      </h3>
      <div className="space-y-2 text-sm">
        <p className="text-gray-400">
          <strong className="text-white">Optimal account for selling:</strong>{' '}
          {result.byDemat[recommendation.optimalDematForSale]?.accountName}
        </p>
        <p className="text-gray-400">
          <strong className="text-white">Reason:</strong>{' '}
          {recommendation.reason}
        </p>
        <p className="text-gray-400">
          <strong className="text-white">LTCG Exemption Remaining:</strong>{' '}
          <span className="text-green-400">{formatCurrency(totals.ltcgExemptionRemaining)}</span>
          {' '}of {formatCurrency(TAX_CONFIG.LTCG_EXEMPTION)}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TaxPage() {
  const navigate = useNavigate();
  const { isDematConnected, isDataAvailable, getSnapshot } = usePortfolioCore();

  // Initialize tax engine
  const taxEngine = useMemo(() => new TaxEngine('IN'), []);

  // Compute taxes from snapshot
  const taxResult = useMemo<TaxComputationResult | null>(() => {
    if (!isDematConnected || !isDataAvailable) {
      return null;
    }
    const snapshot = getSnapshot();
    return taxEngine.computeFromSnapshot(snapshot);
  }, [isDematConnected, isDataAvailable, getSnapshot, taxEngine]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Show unavailable state if no demat connected
  if (!isDematConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Tax Analysis</h1>
            <p className="text-gray-400 text-sm">Demat connection required</p>
          </div>
        </div>
        
        <TaxUnavailable onNavigateToPortfolio={() => navigate('/portfolio')} />
      </div>
    );
  }

  // Show loading or error states
  if (!taxResult) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Tax Analysis</h1>
            <p className="text-gray-400 text-sm">Calculating...</p>
          </div>
        </div>
        
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  // Show error state
  if (!taxResult.success) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Tax Analysis</h1>
            <p className="text-red-400 text-sm">Error</p>
          </div>
        </div>
        
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Unable to Calculate Taxes</h3>
          <p className="text-gray-400">{taxResult.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Tax Analysis</h1>
          <p className="text-gray-400 text-sm">
            FY 2024-25 capital gains computation
          </p>
        </div>
      </div>

      {/* Tax Info */}
      <TaxInfoPanel />

      {/* Warnings */}
      <WarningsPanel warnings={taxResult.warnings} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <TaxSummaryCard
          title="Total STCG"
          value={formatCurrency(taxResult.totals.stcgGains - taxResult.totals.stcgLosses)}
          subtitle={`Tax: ${formatCurrency(taxResult.totals.stcgTax)}`}
          icon={TrendingUp}
          color={taxResult.totals.stcgGains > taxResult.totals.stcgLosses ? 'green' : 'red'}
        />
        <TaxSummaryCard
          title="Total LTCG"
          value={formatCurrency(taxResult.totals.ltcgGains - taxResult.totals.ltcgLosses)}
          subtitle={`Tax: ${formatCurrency(taxResult.totals.ltcgTax)}`}
          icon={TrendingUp}
          color={taxResult.totals.ltcgGains > taxResult.totals.ltcgLosses ? 'green' : 'red'}
        />
        <TaxSummaryCard
          title="LTCG Exemption Used"
          value={formatCurrency(taxResult.totals.ltcgExemptionUsed)}
          subtitle={`Remaining: ${formatCurrency(taxResult.totals.ltcgExemptionRemaining)}`}
          icon={Info}
          color="blue"
        />
        <TaxSummaryCard
          title="Total Tax Liability"
          value={formatCurrency(taxResult.totals.totalTax)}
          subtitle="If all holdings sold today"
          icon={Calculator}
          color="red"
        />
      </div>

      {/* Recommendation */}
      <RecommendationPanel result={taxResult} />

      {/* Breakdown Table */}
      <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold">Tax Breakdown by Account</h3>
        </div>
        <TaxBreakdownTable result={taxResult} />
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-gray-800/50 rounded-xl text-gray-500 text-xs">
        <strong>Disclaimer:</strong> This is an estimate based on current holdings and prices. 
        Actual tax liability may vary. Consult a qualified tax professional for advice. 
        Tax calculations follow FY 2024-25 budget rules: STCG at {(TAX_CONFIG.STCG_RATE * 100).toFixed(0)}%, 
        LTCG at {(TAX_CONFIG.LTCG_RATE * 100).toFixed(1)}% above ₹{(TAX_CONFIG.LTCG_EXEMPTION / 100000).toFixed(2)} lakh exemption.
      </div>
    </div>
  );
}
