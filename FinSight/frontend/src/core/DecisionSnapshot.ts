/**
 * DecisionSnapshot - Immutable Decision Records
 * 
 * PHASE 18: Decision Authority Lock
 * 
 * RULES (NON-NEGOTIABLE):
 * - Once created, snapshot is IMMUTABLE
 * - Any recomputation creates a NEW snapshot
 * - Old snapshots remain FOREVER
 * - All snapshots have integrity hash (SHA256 equivalent)
 * - MarketTimeline references snapshot IDs, not raw decisions
 */

import { DecisionContext, ContextStatus } from './DecisionContext';
import { DecisionAuditLog } from '../audit/DecisionAuditLog';

// Use ContextStatus from DecisionContext
export type DecisionContextStatus = ContextStatus;

// =============================================================================
// TYPES
// =============================================================================

export type SnapshotSource = 
  | 'TAX_AWARE_ALLOCATOR'
  | 'SCENARIO_ENGINE'
  | 'FINBOT_CIO'
  | 'USER_MANUAL'
  | 'SHADOW_EXECUTION';

export interface DecisionInput {
  portfolio_snapshot_id?: string;
  portfolio_holdings_count: number;
  portfolio_total_value: number;
  price_count: number;
  price_timestamp: string;
  signal_count: number;
  tax_analysis_count: number;
  market_regime: string;
}

export interface DecisionOutput {
  action: string;           // BUY, SELL, HOLD, AVOID, etc.
  symbol?: string;
  quantity?: number;
  reasoning: string[];
  confidence: number;       // 0-100
  expected_return?: number;
  expected_tax_impact?: number;
  post_tax_return?: number;
}

export interface DecisionSnapshot {
  // Identity (immutable)
  readonly id: string;
  readonly created_at: string;
  readonly source: SnapshotSource;
  
  // Context reference
  readonly decision_context_id: string;
  readonly context_status: DecisionContextStatus;
  readonly context_timestamp: string;
  
  // Inputs (frozen at snapshot time)
  readonly inputs: DecisionInput;
  
  // Outputs (the actual decision)
  readonly outputs: DecisionOutput[];
  
  // Metadata
  readonly user_id?: string;
  readonly session_id?: string;
  readonly expires_at?: string;  // When this recommendation becomes stale
  
  // Integrity
  readonly integrity_hash: string;
  readonly previous_snapshot_id?: string;  // Chain of decisions
  
  // Immutability flag
  readonly _frozen: true;
}

// =============================================================================
// INTEGRITY HASH
// =============================================================================

/**
 * Calculate SHA256-like hash for integrity verification
 * Note: This is a simplified hash for browser compatibility
 * In production, use Web Crypto API for actual SHA256
 */
function calculateIntegrityHash(data: Omit<DecisionSnapshot, 'integrity_hash' | '_frozen'>): string {
  const serialized = JSON.stringify({
    id: data.id,
    created_at: data.created_at,
    source: data.source,
    decision_context_id: data.decision_context_id,
    context_status: data.context_status,
    inputs: data.inputs,
    outputs: data.outputs
  });
  
  // Simple hash implementation (FNV-1a variant)
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  
  // Convert to hex string with prefix
  return 'SNAP-' + hash.toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Verify snapshot integrity
 */
export function verifySnapshotIntegrity(snapshot: DecisionSnapshot): boolean {
  const expectedHash = calculateIntegrityHash({
    id: snapshot.id,
    created_at: snapshot.created_at,
    source: snapshot.source,
    decision_context_id: snapshot.decision_context_id,
    context_status: snapshot.context_status,
    context_timestamp: snapshot.context_timestamp,
    inputs: snapshot.inputs,
    outputs: snapshot.outputs,
    user_id: snapshot.user_id,
    session_id: snapshot.session_id,
    expires_at: snapshot.expires_at,
    previous_snapshot_id: snapshot.previous_snapshot_id
  });
  
  return snapshot.integrity_hash === expectedHash;
}

// =============================================================================
// SNAPSHOT MANAGER
// =============================================================================

export class DecisionSnapshotManager {
  private static instance: DecisionSnapshotManager;
  private snapshots: Map<string, DecisionSnapshot> = new Map();
  private auditLog: DecisionAuditLog;
  private currentSnapshotId: string | null = null;
  
  private constructor() {
    this.auditLog = DecisionAuditLog.getInstance();
    this.loadFromStorage();
  }
  
  public static getInstance(): DecisionSnapshotManager {
    if (!DecisionSnapshotManager.instance) {
      DecisionSnapshotManager.instance = new DecisionSnapshotManager();
    }
    return DecisionSnapshotManager.instance;
  }
  
  /**
   * Load snapshots from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('finvest_decision_snapshots');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [id, snapshot] of Object.entries(parsed)) {
          // Verify integrity before loading
          if (verifySnapshotIntegrity(snapshot as DecisionSnapshot)) {
            this.snapshots.set(id, snapshot as DecisionSnapshot);
          } else {
            console.warn(`Snapshot ${id} failed integrity check, skipping`);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load snapshots from storage:', e);
    }
  }
  
  /**
   * Save snapshots to localStorage
   */
  private saveToStorage(): void {
    try {
      const toStore: Record<string, DecisionSnapshot> = {};
      // Keep only last 100 snapshots in storage
      const recent = Array.from(this.snapshots.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);
      
      for (const snapshot of recent) {
        toStore[snapshot.id] = snapshot;
      }
      
      localStorage.setItem('finvest_decision_snapshots', JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save snapshots to storage:', e);
    }
  }
  
  /**
   * Create a new immutable snapshot
   */
  public createSnapshot(
    context: DecisionContext,
    outputs: DecisionOutput[],
    source: SnapshotSource,
    userId?: string
  ): DecisionSnapshot {
    const now = new Date().toISOString();
    const id = `DSNAP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Extract inputs from context
    const inputs: DecisionInput = {
      portfolio_snapshot_id: context.portfolio_snapshot?.demat_id,
      portfolio_holdings_count: context.enriched_holdings?.length || 0,
      portfolio_total_value: context.portfolio_snapshot?.total_invested || 0,
      price_count: context.live_prices?.size || 0,
      price_timestamp: now,
      signal_count: context.finsight_signals?.size || 0,
      tax_analysis_count: context.tax_analyses?.size || 0,
      market_regime: context.market_regime || 'UNKNOWN'
    };
    
    // Create base snapshot (without hash)
    const baseSnapshot = {
      id,
      created_at: now,
      source,
      decision_context_id: context.id,
      context_status: context.status,
      context_timestamp: now,
      inputs,
      outputs,
      user_id: userId,
      session_id: undefined, // Session ID managed by audit log
      expires_at: this.calculateExpiry(source),
      previous_snapshot_id: this.currentSnapshotId || undefined
    };
    
    // Calculate integrity hash
    const integrity_hash = calculateIntegrityHash(baseSnapshot);
    
    // Create frozen snapshot
    const snapshot: DecisionSnapshot = Object.freeze({
      ...baseSnapshot,
      integrity_hash,
      _frozen: true as const
    });
    
    // Store snapshot
    this.snapshots.set(id, snapshot);
    this.currentSnapshotId = id;
    this.saveToStorage();
    
    // Log to audit
    this.auditLog.log({
      event_type: 'RECOMMENDATION_GENERATED',
      severity: 'INFO',
      summary: `Decision snapshot created: ${id}`,
      details: {
        snapshot_id: id,
        source,
        outputs_count: outputs.length,
        confidence: outputs[0]?.confidence || 0,
        integrity_hash
      },
      actor: 'ENGINE'
    });
    
    return snapshot;
  }
  
  /**
   * Calculate expiry based on source type
   */
  private calculateExpiry(source: SnapshotSource): string {
    const now = new Date();
    switch (source) {
      case 'TAX_AWARE_ALLOCATOR':
        // Tax recommendations valid for 24 hours
        now.setHours(now.getHours() + 24);
        break;
      case 'SCENARIO_ENGINE':
        // Scenarios valid for 4 hours
        now.setHours(now.getHours() + 4);
        break;
      case 'FINBOT_CIO':
        // FinBot responses valid for 1 hour
        now.setHours(now.getHours() + 1);
        break;
      case 'SHADOW_EXECUTION':
        // Shadow executions never expire (historical)
        now.setFullYear(now.getFullYear() + 10);
        break;
      default:
        now.setHours(now.getHours() + 12);
    }
    return now.toISOString();
  }
  
  /**
   * Get snapshot by ID
   */
  public getSnapshot(id: string): DecisionSnapshot | null {
    return this.snapshots.get(id) || null;
  }
  
  /**
   * Get all snapshots for a symbol
   */
  public getSnapshotsForSymbol(symbol: string): DecisionSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter(s => s.outputs.some(o => o.symbol === symbol))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  
  /**
   * Get recent snapshots
   */
  public getRecentSnapshots(limit: number = 20): DecisionSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }
  
  /**
   * Check if snapshot is expired
   */
  public isExpired(snapshot: DecisionSnapshot): boolean {
    if (!snapshot.expires_at) return false;
    return new Date() > new Date(snapshot.expires_at);
  }
  
  /**
   * Get snapshot chain (history of related decisions)
   */
  public getSnapshotChain(snapshotId: string): DecisionSnapshot[] {
    const chain: DecisionSnapshot[] = [];
    let current = this.snapshots.get(snapshotId);
    
    while (current) {
      chain.push(current);
      if (current.previous_snapshot_id) {
        current = this.snapshots.get(current.previous_snapshot_id);
      } else {
        break;
      }
    }
    
    return chain;
  }
  
  /**
   * Format snapshot for UI display
   */
  public formatForUI(snapshot: DecisionSnapshot): {
    date: string;
    inputs_summary: string;
    action_summary: string;
    confidence_display: string;
    integrity_status: 'VALID' | 'INVALID' | 'EXPIRED';
  } {
    const isValid = verifySnapshotIntegrity(snapshot);
    const isExpired = this.isExpired(snapshot);
    
    return {
      date: new Date(snapshot.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      inputs_summary: `${snapshot.inputs.portfolio_holdings_count} holdings, ${snapshot.inputs.signal_count} signals, ${snapshot.inputs.market_regime} regime`,
      action_summary: snapshot.outputs.map(o => `${o.action} ${o.symbol || ''}`).join(', '),
      confidence_display: `${snapshot.outputs[0]?.confidence || 0}%`,
      integrity_status: !isValid ? 'INVALID' : isExpired ? 'EXPIRED' : 'VALID'
    };
  }
  
  /**
   * Get current snapshot ID
   */
  public getCurrentSnapshotId(): string | null {
    return this.currentSnapshotId;
  }
}

// Export singleton getter
export const getDecisionSnapshotManager = () => DecisionSnapshotManager.getInstance();

export default DecisionSnapshotManager;

