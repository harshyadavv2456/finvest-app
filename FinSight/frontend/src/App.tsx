/**
 * FinVest - Financial Operating System
 * 
 * ARCHITECTURE REFACTOR:
 * - DataCore: Centralized data loading (NO UI fetches directly)
 * - PortfolioCore: Multi-demat, holdings, cash, tax lots
 * - FinBot, AI Pilot, Execution: DISABLED until stable
 */

import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataCoreProvider } from './core/DataCore';
import { PortfolioCoreProvider } from './core/PortfolioCore';

// Global Layout
import AppLayout from './components/Layout/AppLayout';

// Core Pages - RESTORED (FinVest is NOT a trading app)
import FinVestDashboard from './pages/FinVestDashboard';
import FinDashPage from './pages/FinDashPage';
import StockIntelligencePage from './pages/StockIntelligencePage';
import ScreenerTable from './components/ScreenerTable';
import SmartMoneyPage from './pages/SmartMoneyPage';
import SettingsPage from './pages/SettingsPage';

// Disabled pages (placeholders)
import DisabledFeaturePage from './pages/DisabledFeaturePage';

// Secondary Pages
import StockDetail from './pages/StockDetail';
import TopOpportunitiesPage from './pages/TopOpportunitiesPage';
import MarketOverviewPage from './pages/MarketOverviewPage';
import HedgeFundExplorerPage from './pages/HedgeFundExplorerPage';
import InsiderFlowPage from './pages/InsiderFlowPage';
import AIInsightsPage from './pages/AIInsightsPage';
import SimulatorPage from './pages/SimulatorPage';
import ActivePositionsPage from './pages/ActivePositionsPage';
import StrataXPage from './features/stratax/pages/StrataXPage';
import IntrinsIQPage from './pages/IntrinsIQPage';
import AlphaRankingsPage from './pages/AlphaRankingsPage';
import CrossSignalInsightsPage from './pages/CrossSignalInsightsPage';

// Stock dashboard used in screener detail view
import StockDashboardPage from './pages/StockDashboardPage';
import MarketIntelPage from './pages/MarketIntelPage';

// Auth (disabled but routes kept)
import AuthPage from './pages/AuthPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import AlertsPage from './pages/AlertsPage';
import BillingPage from './pages/BillingPage';
import DailyBriefPage from './pages/DailyBriefPage';
import DecisionReviewPage from './pages/DecisionReviewPage';
import AuthorityStatusPage from './pages/AuthorityStatusPage';
import ExecutionSandboxPage from './pages/ExecutionSandboxPage';
import TrustDashboardPage from './pages/TrustDashboardPage';
import DecisionTimelineView from './pages/DecisionTimelineView';
import ConfidenceTimelineView from './pages/ConfidenceTimelineView';
import SystemStatus from './pages/SystemStatus';
import AuditDecision from './pages/AuditDecision';

// FinBot Strict Mode - Position Reporter Only
import FinBotStrict from './components/FinBotStrict';

function DashboardRedirect() {
  const { ticker } = useParams();
  return <Navigate to={`/stock/${ticker}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <DataCoreProvider>
        <PortfolioCoreProvider>
          <BrowserRouter>
            {/* FinBot Strict Mode - Position Reporter Only */}
            <FinBotStrict />
            
            <Routes>
              {/* All routes wrapped in AppLayout with permanent sidebar */}
              <Route element={<AppLayout />}>
                {/* ==================== */}
                {/* CORE MODULES         */}
                {/* ==================== */}
                
                {/* Dashboard - Main entry (RESTORED) */}
                <Route index element={<FinVestDashboard />} />
                
                {/* Markets (FinDash) */}
                <Route path="markets" element={<FinDashPage />} />
                <Route path="dashboard" element={<Navigate to="/markets" replace />} />
                <Route path="market-overview" element={<MarketOverviewPage />} />
                <Route path="market-intel" element={<MarketIntelPage />} />
                
                {/* Simulator (Opportunities from Intelligence Pipeline) */}
                <Route path="simulator" element={<SimulatorPage />} />
                
                {/* Active Positions & Exit Signals (PHASE 45) */}
                <Route path="positions" element={<ActivePositionsPage />} />
                <Route path="exits" element={<ActivePositionsPage />} />
                
                {/* Intelligence (FinSight) - Stock Analysis */}
                <Route path="intelligence" element={<StockIntelligencePage />} />
                <Route path="intelligence/:ticker" element={<StockIntelligencePage />} />
                <Route path="intelligence/:market/:ticker" element={<StockIntelligencePage />} />
                <Route path="stock-intelligence" element={<Navigate to="/intelligence" replace />} />
                <Route path="stock-intelligence/:market/:ticker" element={<StockIntelligencePage />} />
                <Route path="opportunities" element={<TopOpportunitiesPage />} />
                <Route path="ai-insights" element={<AIInsightsPage />} />
                
                {/* Screener */}
                <Route path="screener" element={<ScreenerTable />} />
                <Route path="stock/:ticker" element={<StockDetail />} />
                
                {/* Smart Money */}
                <Route path="smart-money" element={<SmartMoneyPage />} />
                <Route path="hedge-funds" element={<HedgeFundExplorerPage />} />
                <Route path="insider-flow" element={<InsiderFlowPage />} />
                <Route path="fii-dii" element={<SmartMoneyPage />} /> {/* FII/DII uses SmartMoneyPage with tab */}
                
                {/* Portfolio & Tax routes hidden from nav but kept for direct access */}
                
                {/* Daily Brief */}
                <Route path="daily-brief" element={<DailyBriefPage />} />
                
                {/* Decision Review (PHASE 20: Consequence View) */}
                <Route path="decision-review/:id" element={<DecisionReviewPage />} />
                
                {/* Authority Status (PHASE 21: Read-Only Status Page) */}
                <Route path="system/authority" element={<AuthorityStatusPage />} />
                
                {/* Execution Sandbox (PHASE 22: NO REAL MONEY) */}
                <Route path="execution/sandbox" element={<ExecutionSandboxPage />} />
                
                {/* Trust Dashboard (PHASE 23: TRUST & PROOF) */}
                <Route path="trust" element={<TrustDashboardPage />} />
                
                {/* Decision Timeline (PHASE 27: MARKET-REALITY FEEDBACK) */}
                <Route path="timeline" element={<DecisionTimelineView />} />
                
                {/* Confidence Governance (PHASE 28: CONFIDENCE DISCIPLINE) */}
                <Route path="confidence" element={<ConfidenceTimelineView />} />
                
                {/* System Status (PHASE 36: SYSTEM REALITY CHECK) */}
                <Route path="system/status" element={<SystemStatus />} />
                
                {/* Audit Decision (PHASE 37: INSTITUTIONAL AUDIT) */}
                <Route path="audit/decision/:snapshotId" element={<AuditDecision />} />
                
                {/* ==================== */}
                {/* DISABLED FEATURES    */}
                {/* Until DataCore+PortfolioCore stable */}
                {/* ==================== */}
                
                {/* AI Pilot - DISABLED */}
                <Route 
                  path="ai-pilot" 
                  element={
                    <DisabledFeaturePage 
                      feature="AI Pilot" 
                      reason="DataCore architecture stabilization in progress"
                    />
                  } 
                />
                
                {/* Execution - DISABLED */}
                <Route 
                  path="execution" 
                  element={
                    <DisabledFeaturePage 
                      feature="Execution" 
                      reason="Requires stable DataCore and PortfolioCore"
                    />
                  } 
                />
                
                {/* Options */}
                <Route path="stratax" element={<StrataXPage />} />
                
                {/* IntrinsIQ - AI Value Investor (Internal Data) */}
                <Route path="intrinsiq" element={<IntrinsIQPage />} />
                <Route path="value-analysis" element={<IntrinsIQPage />} />

                {/* Alpha Rankings - Market-wide mispricing scanner */}
                <Route path="alpha-rankings" element={<AlphaRankingsPage />} />

                {/* Cross-Signal Insights - quant conviction vs. news sentiment */}
                <Route path="insights" element={<CrossSignalInsightsPage />} />

                {/* Stock Dashboard - redirect to stock detail page */}
                <Route path="dashboard/:ticker" element={<DashboardRedirect />} />
                
                {/* Settings & User */}
                <Route path="settings" element={<SettingsPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="billing" element={<BillingPage />} />
              </Route>
              
              {/* Auth routes (outside main layout) */}
              <Route path="login" element={<AuthPage />} />
              <Route path="auth/callback" element={<AuthCallbackPage />} />
              
              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </PortfolioCoreProvider>
      </DataCoreProvider>
    </AuthProvider>
  );
}

export default App;
