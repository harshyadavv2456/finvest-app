/**
 * useAuthorityGate - Hook for Authority Enforcement in Components
 * 
 * PHASES 18-20: Hard Enforcement
 * 
 * USE THIS HOOK in any component that displays decisions:
 * - Recommendations
 * - FinBot responses
 * - Scenarios
 * - Shadow executions
 * 
 * If authority check fails, component MUST NOT render the decision.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  AuthorityGuard, 
  getAuthorityGuard, 
  AuthorityCheckResult 
} from '../core/AuthorityEnforcement';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';

export interface AuthorityGateState {
  // Loading state
  loading: boolean;
  
  // Authority check result
  check: AuthorityCheckResult | null;
  
  // Derived state for easy access
  allowed: boolean;
  blocked: boolean;
  blockReason: string;
  actionRequired: string;
  
  // Current snapshot
  snapshotId: string | null;
  
  // Refresh function
  refresh: () => void;
}

/**
 * useAuthorityGate
 * 
 * Performs authority check and returns state.
 * Components MUST check `allowed` before rendering decisions.
 * 
 * @param snapshotId - Optional specific snapshot to check. If null, uses current.
 */
export function useAuthorityGate(snapshotId?: string | null): AuthorityGateState {
  const [loading, setLoading] = useState(true);
  const [check, setCheck] = useState<AuthorityCheckResult | null>(null);
  
  const performCheck = useCallback(() => {
    setLoading(true);
    
    try {
      const guard = getAuthorityGuard();
      const snapshotAuthority = getSnapshotAuthority();
      
      // Use provided snapshotId or get current
      const idToCheck = snapshotId !== undefined 
        ? snapshotId 
        : snapshotAuthority.getCurrentSnapshotId();
      
      const result = guard.checkAuthority(idToCheck);
      setCheck(result);
    } catch (e) {
      // If authority check itself fails, fail closed
      setCheck({
        allowed: false,
        blocked_by: 'SNAPSHOT',
        reason: `Authority check failed: ${String(e)}`,
        action_required: 'RELOAD_APPLICATION',
        snapshot_check: {
          allowed: false,
          reason: 'Authority check error',
          snapshot_id: null,
          context_status: 'UNKNOWN',
          action_required: 'RELOAD'
        },
        memory_available: false,
        consequence_available: false,
        snapshot_id: null,
        memory_stats: null,
        consequence: null,
        audit_log_id: ''
      });
    } finally {
      setLoading(false);
    }
  }, [snapshotId]);
  
  useEffect(() => {
    performCheck();
  }, [performCheck]);
  
  return {
    loading,
    check,
    allowed: check?.allowed ?? false,
    blocked: !check?.allowed,
    blockReason: check?.reason ?? 'Authority check not completed',
    actionRequired: check?.action_required ?? 'WAIT',
    snapshotId: check?.snapshot_id ?? null,
    refresh: performCheck
  };
}

/**
 * useRequireSnapshot
 * 
 * Simplified hook that REQUIRES a valid snapshot.
 * Returns null if snapshot is invalid - component should not render.
 */
export function useRequireSnapshot(): {
  valid: boolean;
  snapshotId: string | null;
  error: string | null;
  loading: boolean;
} {
  const gate = useAuthorityGate();
  
  return {
    valid: gate.allowed && gate.snapshotId !== null,
    snapshotId: gate.snapshotId,
    error: gate.blocked ? gate.blockReason : null,
    loading: gate.loading
  };
}

/**
 * useMemoryAwareFinBot
 * 
 * Hook for components using FinBot with mandatory memory.
 */
export function useMemoryAwareFinBot() {
  const gate = useAuthorityGate();
  
  return {
    ready: gate.check?.memory_available ?? false,
    memoryStats: gate.check?.memory_stats ?? null,
    error: !gate.check?.memory_available ? 'Memory unavailable' : null
  };
}

/**
 * useConsequenceTracking
 * 
 * Hook for components that need consequence data.
 */
export function useConsequenceTracking(snapshotId: string | null) {
  const gate = useAuthorityGate(snapshotId);
  
  return {
    hasConsequence: gate.check?.consequence_available ?? false,
    consequence: gate.check?.consequence ?? null,
    status: gate.check?.consequence?.status ?? 'PENDING'
  };
}

export default useAuthorityGate;

