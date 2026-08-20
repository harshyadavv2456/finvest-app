/**
 * StrataX Paper Trades Component
 * 
 * Displays and manages saved paper trades.
 */

import { useState } from 'react';
import { Trash2, Plus, Edit2 } from 'lucide-react';
import { useStrataXPaperTrades } from '../hooks/useStrataXPaperTrades';
import { StrataXPaperTrade } from '../types/strataxTypes';

export default function StrataXPaperTrades() {
  const { trades, loading, deletePaperTrade } = useStrataXPaperTrades();
  const [editingTrade, setEditingTrade] = useState<StrataXPaperTrade | null>(null);
  const [showNewTrade, setShowNewTrade] = useState(false);

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this paper trade?')) {
      deletePaperTrade(id);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const formatNumber = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    return value.toFixed(2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bloomberg-text-muted">Loading paper trades...</div>
      </div>
    );
  }

  // If editing or creating new trade, show strategy builder
  if (editingTrade || showNewTrade) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-bloomberg-text">
            {editingTrade ? 'Edit Paper Trade' : 'New Paper Trade'}
          </h3>
          <button
            onClick={() => {
              setEditingTrade(null);
              setShowNewTrade(false);
            }}
            className="px-4 py-2 bg-bloomberg-panel border border-bloomberg-border rounded-lg text-bloomberg-text hover:bg-bloomberg-dark transition-colors"
          >
            Cancel
          </button>
        </div>
        {/* TODO: Integrate with strategy builder to save paper trade */}
        <div className="text-bloomberg-text-muted">
          Paper trade saving will be integrated with Strategy Builder.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-bloomberg-text">Paper Trades</h3>
        <button
          onClick={() => setShowNewTrade(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          New Paper Trade
        </button>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-12 text-bloomberg-text-muted">
          <p className="mb-2">No paper trades saved yet.</p>
          <p className="text-sm">Create a strategy in Strategy Builder and save it as a paper trade.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="bg-bloomberg-panel border border-bloomberg-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg font-semibold text-bloomberg-text mb-1">
                    {trade.name}
                  </h4>
                  <div className="text-sm text-bloomberg-text-muted">
                    Created: {formatDate(trade.entryTimestamp)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTrade(trade)}
                    className="p-2 text-bloomberg-text-muted hover:text-blue-400 transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trade.id)}
                    className="p-2 text-bloomberg-text-muted hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Strategy Summary */}
              <div className="mb-4">
                <div className="text-xs text-bloomberg-text-muted mb-2">Strategy Legs</div>
                <div className="space-y-1">
                  {trade.strategy.legs.map((leg, idx) => (
                    <div key={leg.id} className="text-sm text-bloomberg-text">
                      {idx + 1}. {leg.action} {leg.quantity}x {leg.underlying} {leg.strike} {leg.optionType} @ {formatNumber(leg.entryPrice)}
                    </div>
                  ))}
                </div>
              </div>

              {/* P&L */}
              {trade.currentPnL !== undefined && (
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-xs text-bloomberg-text-muted">Current P&L</div>
                    <div className={`text-lg font-semibold ${
                      trade.currentPnL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trade.currentPnL >= 0 ? '+' : ''}{formatNumber(trade.currentPnL)}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {trade.notes && (
                <div className="mt-4 pt-4 border-t border-bloomberg-border">
                  <div className="text-xs text-bloomberg-text-muted mb-1">Notes</div>
                  <div className="text-sm text-bloomberg-text">{trade.notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

