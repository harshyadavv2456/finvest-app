/**
 * AuthorityStatusPage - System Authority Status
 * 
 * PHASE 21: Adversarial Authority Validation
 * 
 * Route: /system/authority
 * 
 * This page is READ-ONLY.
 * No buttons. No toggles.
 * 
 * Displays:
 * - SnapshotAuthority: ACTIVE / FAILED
 * - UserMemory: ACTIVE / FAILED
 * - ConsequenceAuthority: ACTIVE / FAILED
 * - DecisionAuditLog: ACTIVE / FAILED
 * - Fail-Closed Mode: ENABLED (hardcoded)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Shield, CheckCircle, XCircle, 
  AlertTriangle, RefreshCw, Lock,
  Activity
} from 'lucide-react';

// Import authority modules
import { getSnapshotAuthority } from '../core/SnapshotAuthority';
import { UserMemory } from '../memory/UserMemory';
import { getConsequenceAuthority } from '../analysis/ConsequenceAuthority';
import { DecisionAuditLog, auditLog } from '../audit/DecisionAuditLog';
import { getAuthorityGuard } from '../core/AuthorityEnforcement';

// =============================================================================
// TYPES
// =============================================================================

type AuthorityStatus = 'ACTIVE' | 'FAILED' | 'CHECKING';

interface AuthorityCheck {
  name: string;
  status: AuthorityStatus;
  details: string;
  stats: Record<string, number | string>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AuthorityStatusPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [checks, setChecks] = useState<AuthorityCheck[]>([]);
  
  useEffect(() => {
    runAuthorityChecks();
  }, []);
  
  const runAuthorityChecks = () => {
    setLoading(true);
    
    const results: AuthorityCheck[] = [];
    
    // Check 1: SnapshotAuthority
    try {
      const snapshot = getSnapshotAuthority();
      const gate = snapshot.checkRenderGate(null);
      
      results.push({
        name: 'SnapshotAuthority',
        status: gate.allowed === false ? 'ACTIVE' : 'FAILED', // Should REFUSE null
        details: 'Enforces snapshot creation and validation for all decisions',
        stats: {
          'Current Snapshot': snapshot.getCurrentSnapshotId() || 'None',
          'Null Gate': gate.allowed ? 'FAILED (allowed null)' : 'PASS (blocked null)'
        }
      });
    } catch (e) {
      results.push({
        name: 'SnapshotAuthority',
        status: 'FAILED',
        details: `Error: ${String(e)}`,
        stats: {}
      });
    }
    
    // Check 2: UserMemory
    try {
      const memory = UserMemory.getInstance();
      const stats = memory.getStats();
      const modifiers = memory.getResponseModifiers();
      
      results.push({
        name: 'UserMemory',
        status: 'ACTIVE',
        details: 'Tracks user behavior and adjusts FinBot confidence',
        stats: {
          'Advice Shown': stats.total_advice_shown,
          'Accepted': stats.total_accepted,
          'Ignored': stats.total_ignored,
          'Confidence Modifier': `${modifiers.confidence_adjustment}%`,
          'Clarity Modifier': `${modifiers.clarity_multiplier}x`
        }
      });
    } catch (e) {
      results.push({
        name: 'UserMemory',
        status: 'FAILED',
        details: `Error: ${String(e)}`,
        stats: {}
      });
    }
    
    // Check 3: ConsequenceAuthority
    try {
      const consequence = getConsequenceAuthority();
      const stats = consequence.getStats();
      
      results.push({
        name: 'ConsequenceAuthority',
        status: 'ACTIVE',
        details: 'Tracks decision outcomes and computes regret index',
        stats: {
          'Total Snapshots': stats.total_snapshots,
          'With Consequences': stats.with_consequences,
          'Without Consequences': stats.without_consequences,
          'FinVest Wins': stats.finvest_wins,
          'User Wins': stats.user_wins,
          'Avg Regret': `${stats.average_regret.toFixed(1)}`
        }
      });
    } catch (e) {
      results.push({
        name: 'ConsequenceAuthority',
        status: 'FAILED',
        details: `Error: ${String(e)}`,
        stats: {}
      });
    }
    
    // Check 4: DecisionAuditLog
    try {
      const stats = auditLog.getStats();
      const integrity = auditLog.verifyIntegrity();
      
      results.push({
        name: 'DecisionAuditLog',
        status: integrity.valid ? 'ACTIVE' : 'FAILED',
        details: 'Immutable audit trail for all decisions',
        stats: {
          'Total Entries': stats.total_entries,
          'Integrity': integrity.valid ? 'VALID' : `INVALID (${integrity.errors.length} errors)`,
          'Session Start': stats.session_start || 'Unknown'
        }
      });
    } catch (e) {
      results.push({
        name: 'DecisionAuditLog',
        status: 'FAILED',
        details: `Error: ${String(e)}`,
        stats: {}
      });
    }
    
    // Check 5: AuthorityGuard (meta-check)
    try {
      const guard = getAuthorityGuard();
      const check = guard.checkAuthority(null);
      
      results.push({
        name: 'AuthorityGuard',
        status: check.allowed === false ? 'ACTIVE' : 'FAILED',
        details: 'Central authority enforcement for all components',
        stats: {
          'Null Authority': check.allowed ? 'FAILED' : 'BLOCKED',
          'Block Reason': check.reason.slice(0, 50) + (check.reason.length > 50 ? '...' : ''),
          'Memory Available': check.memory_available ? 'Yes' : 'No'
        }
      });
    } catch (e) {
      results.push({
        name: 'AuthorityGuard',
        status: 'FAILED',
        details: `Error: ${String(e)}`,
        stats: {}
      });
    }
    
    setChecks(results);
    setLastChecked(new Date().toISOString());
    setLoading(false);
  };
  
  const allActive = checks.every(c => c.status === 'ACTIVE');
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  
  return (
    <div className="min-h-screen bg-[#0a0e14] text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Shield className="w-10 h-10 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Authority Status</h1>
              <p className="text-gray-400">System authority enforcement status (READ-ONLY)</p>
            </div>
          </div>
          
          {loading && (
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          )}
        </div>
        
        {/* Overall Status */}
        <div className={`rounded-lg p-6 mb-8 border ${
          allActive 
            ? 'bg-green-900/20 border-green-500/30'
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <div className="flex items-center gap-4">
            {allActive ? (
              <CheckCircle className="w-8 h-8 text-green-400" />
            ) : (
              <XCircle className="w-8 h-8 text-red-400" />
            )}
            <div>
              <div className={`text-2xl font-bold ${allActive ? 'text-green-400' : 'text-red-400'}`}>
                {allActive ? 'ALL AUTHORITIES ACTIVE' : `${failedCount} AUTHORITY FAILURES`}
              </div>
              <div className="text-gray-400">
                {allActive 
                  ? 'System is enforcing all decision authority checks'
                  : 'System has authority enforcement failures - decisions may be blocked'
                }
              </div>
            </div>
          </div>
        </div>
        
        {/* Fail-Closed Mode Banner */}
        <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/30 mb-8">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-blue-400" />
            <div>
              <div className="font-bold text-blue-400">FAIL-CLOSED MODE: ENABLED</div>
              <div className="text-sm text-gray-400">
                System refuses all operations when authority checks fail. This cannot be disabled.
              </div>
            </div>
          </div>
        </div>
        
        {/* Authority Checks */}
        <div className="space-y-4">
          {checks.map((check, i) => (
            <div 
              key={i}
              className={`rounded-lg p-4 border ${
                check.status === 'ACTIVE' 
                  ? 'bg-gray-800/30 border-gray-700'
                  : 'bg-red-900/20 border-red-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {check.status === 'ACTIVE' ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : check.status === 'FAILED' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-yellow-400 animate-spin" />
                  )}
                  <span className="font-bold text-white">{check.name}</span>
                </div>
                <span className={`px-3 py-1 rounded text-sm font-bold ${
                  check.status === 'ACTIVE' 
                    ? 'bg-green-500/20 text-green-400'
                    : check.status === 'FAILED'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {check.status}
                </span>
              </div>
              
              <p className="text-sm text-gray-400 mb-3">{check.details}</p>
              
              {Object.keys(check.stats).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Object.entries(check.stats).map(([key, value]) => (
                    <div key={key} className="bg-gray-800/50 rounded px-2 py-1">
                      <span className="text-gray-500">{key}: </span>
                      <span className="text-white font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Phase 21 Info */}
        <div className="mt-8 bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Phase 21: Adversarial Authority Validation
          </h3>
          <div className="text-sm text-gray-400 space-y-2">
            <p>This page displays the status of all authority enforcement systems.</p>
            <p>No buttons or toggles are available - this is a READ-ONLY view.</p>
            <p className="font-bold text-yellow-400">
              If any authority is FAILED, the system will refuse to provide advice.
            </p>
          </div>
        </div>
        
        {/* Last Checked */}
        {lastChecked && (
          <div className="mt-4 text-center text-xs text-gray-500">
            Last checked: {new Date(lastChecked).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

