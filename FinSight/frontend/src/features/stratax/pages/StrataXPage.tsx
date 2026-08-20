/**
 * StrataX Main Page
 * 
 * Tabbed interface for Option Chain, Strategy Builder, Paper Trades, and Signals.
 */

import { useState } from 'react';
import StrataXOptionChain from '../components/StrataXOptionChain';
import StrataXStrategyBuilder from '../components/StrataXStrategyBuilder';
import StrataXPaperTrades from '../components/StrataXPaperTrades';
import StrataXSignals from '../components/StrataXSignals';
import StrataXDisclaimer from '../components/StrataXDisclaimer';

type Tab = 'chain' | 'builder' | 'trades' | 'signals';

export default function StrataXPage() {
  const [activeTab, setActiveTab] = useState<Tab>('chain');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'chain', label: 'Option Chain' },
    { id: 'builder', label: 'Strategy Builder' },
    { id: 'trades', label: 'Paper Trades' },
    { id: 'signals', label: 'Signals' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600/30 to-purple-600/30 border-b border-bloomberg-border p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              StrataX – Options Strategy & Analytics
            </h1>
            <p className="text-sm text-bloomberg-text-muted mt-1">
              Build, analyze, and track options strategies
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-bloomberg-panel border-b border-bloomberg-border">
        <div className="flex gap-1 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-400'
                  : 'text-bloomberg-text-muted hover:text-bloomberg-text'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'chain' && <StrataXOptionChain />}
        {activeTab === 'builder' && <StrataXStrategyBuilder />}
        {activeTab === 'trades' && <StrataXPaperTrades />}
        {activeTab === 'signals' && <StrataXSignals />}
        <StrataXDisclaimer />
      </div>
    </div>
  );
}
