/**
 * Portfolio Page
 * 
 * Real portfolio data from CAMS/CDSL ingestion.
 * NO mock data. NO placeholders.
 * 
 * If portfolio not connected: Shows "Portfolio not connected" message
 * If connected: Shows real holdings with tax analysis
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, Upload, FileText, TrendingUp, TrendingDown, 
  Clock, AlertCircle, RefreshCw, Download,
  X, CheckCircle, Info
} from 'lucide-react';
import { 
  portfolioIngestion, 
  portfolioCore,
  PortfolioState,
  IngestionSource,
  EnrichedHolding,
  PortfolioSummary
} from '../integrations/portfolio';

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PortfolioState>({ status: 'LOADING' });
  const [holdings, setHoldings] = useState<EnrichedHolding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const loadPortfolio = useCallback(async () => {
    setState({ status: 'LOADING' });
    
    const portfolioState = portfolioCore.getState();
    setState(portfolioState);

    if (portfolioState.status === 'READY') {
      const enrichedHoldings = await portfolioCore.getEnrichedHoldings();
      const portfolioSummary = await portfolioCore.getSummary();
      setHoldings(enrichedHoldings);
      setSummary(portfolioSummary);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const handleFileUpload = async (file: File, source: IngestionSource) => {
    setUploadError(null);
    setUploadSuccess(false);

    const result = await portfolioIngestion.ingestFromFile(file, source);

    if (result.success) {
      setUploadSuccess(true);
      setShowUpload(false);
      await loadPortfolio();
    } else {
      setUploadError(result.error || 'Failed to parse file');
    }
  };

  const handleDownloadTemplate = () => {
    portfolioIngestion.downloadCSVTemplate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Not connected state
  if (state.status === 'NOT_CONNECTED') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-4 sm:p-6">
        <header className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-purple-400" />
            Portfolio
          </h1>
        </header>

        <div className="max-w-2xl mx-auto mt-12">
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Portfolio Not Connected</h2>
            <p className="text-gray-400 mb-6">
              {state.reason}
            </p>

            <div className="space-y-4">
              <button
                onClick={() => setShowUpload(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
              >
                <Upload className="w-5 h-5" />
                Upload Portfolio Statement
              </button>

              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                Download CSV Template
              </button>
            </div>

            <div className="mt-8 text-left">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Supported Formats:</h3>
              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-400" />
                  <span>CAMS Consolidated Account Statement (CAS) - Mutual Funds</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>CDSL Easiest / EasiestEST CSV - Equity Holdings</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <span>Manual CSV (use template above)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Modal */}
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onUpload={handleFileUpload}
            error={uploadError}
          />
        )}
      </div>
    );
  }

  // Loading state
  if (state.status === 'LOADING') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-gray-400">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.status === 'ERROR') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
        <div className="max-w-md mx-auto mt-12 bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-red-400 mb-2">Error Loading Portfolio</h2>
          <p className="text-gray-400 mb-4">{state.error}</p>
          <button
            onClick={loadPortfolio}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Connected state - show portfolio
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 sm:p-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-purple-400" />
            Portfolio
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Source: {state.snapshot.source} • Last updated: {new Date(state.snapshot.ingested_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Update
          </button>
          <button
            onClick={loadPortfolio}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">Total Invested</div>
            <div className="text-lg sm:text-xl font-bold text-white">{formatCurrency(summary.total_invested)}</div>
          </div>
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">Current Value</div>
            <div className="text-lg sm:text-xl font-bold text-white">{formatCurrency(summary.current_value)}</div>
          </div>
          <div className={`bg-[#0d1117] border rounded-xl p-4 ${summary.total_pnl >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
            <div className="text-xs text-gray-400 mb-1">Total P&L</div>
            <div className={`text-lg sm:text-xl font-bold flex items-center gap-1 ${summary.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.total_pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {formatCurrency(Math.abs(summary.total_pnl))}
              <span className="text-sm">({summary.total_pnl_percent.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">Tax Status</div>
            <div className="flex gap-2 text-sm">
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">LTCG: {summary.ltcg_holdings}</span>
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">STCG: {summary.stcg_holdings}</span>
            </div>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white">Holdings ({holdings.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#161b22]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Avg Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Current</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">P&L</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Holding</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Tax Status</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr 
                  key={`${h.symbol}-${i}`}
                  className="border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/stock/${h.symbol}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{h.symbol}</div>
                    <div className="text-xs text-gray-500">{h.isin}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-white">{h.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-400">₹{h.avg_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-white">₹{h.current_price.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right ${h.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <div>{h.unrealized_pnl >= 0 ? '+' : ''}₹{h.unrealized_pnl.toFixed(0)}</div>
                    <div className="text-xs">{h.unrealized_pnl_percent.toFixed(1)}%</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-gray-400">
                      <Clock className="w-3 h-3" />
                      {h.holding_days}d
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {h.is_ltcg_eligible ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">LTCG</span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">STCG</span>
                        <span className="text-xs text-gray-500 mt-0.5">{h.days_to_ltcg}d to LTCG</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleFileUpload}
          error={uploadError}
        />
      )}

      {/* Success Toast */}
      {uploadSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          Portfolio updated successfully!
        </div>
      )}
    </div>
  );
}

// Upload Modal Component
function UploadModal({
  onClose,
  onUpload,
  error
}: {
  onClose: () => void;
  onUpload: (file: File, source: IngestionSource) => void;
  error: string | null;
}) {
  const [selectedSource, setSelectedSource] = useState<IngestionSource>('CDSL_EASIEST');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  const handleSubmit = () => {
    if (file) {
      onUpload(file, selectedSource);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1117] border border-gray-800 rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Upload Portfolio</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Source Selection */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Statement Type</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'CDSL_EASIEST', label: 'CDSL Easiest', desc: 'Equity holdings' },
              { value: 'CAMS_CAS', label: 'CAMS CAS', desc: 'Mutual funds' },
              { value: 'MANUAL_CSV', label: 'Manual CSV', desc: 'Custom format' },
              { value: 'NSDL_CAS', label: 'NSDL CAS', desc: 'Coming soon' }
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedSource(opt.value as IngestionSource)}
                disabled={opt.value === 'NSDL_CAS'}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedSource === opt.value
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                } ${opt.value === 'NSDL_CAS' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-sm font-medium text-white">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* File Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragging ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-white">
              <FileText className="w-5 h-5 text-purple-400" />
              {file.name}
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Drop your CSV file here or</p>
              <label className="text-purple-400 text-sm cursor-pointer hover:underline">
                browse
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files && setFile(e.target.files[0])}
                />
              </label>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Info */}
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Your data is stored locally and never sent to any server.
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!file}
          className={`w-full mt-4 py-3 rounded-lg font-medium transition-colors ${
            file
              ? 'bg-purple-500 hover:bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          Upload Portfolio
        </button>
      </div>
    </div>
  );
}
