/**
 * DecisionAuditLog
 * 
 * GOAL:
 * Complete, immutable audit trail of all decisions and actions.
 * 
 * Logs every:
 * - Recommendation
 * - Tax calculation
 * - User confirmation
 * - Execution attempt (even dry-run)
 * 
 * Logs are:
 * - Immutable
 * - Timestamped
 * - Replayable
 */

// Log entry types
export type AuditEventType = 
  | 'RECOMMENDATION_GENERATED'
  | 'TAX_CALCULATION'
  | 'CONTEXT_CREATED'
  | 'CONTEXT_INVALIDATED'
  | 'USER_CONFIRMATION'
  | 'USER_REJECTION'
  | 'EXECUTION_ATTEMPT'
  | 'EXECUTION_BLOCKED'
  | 'EXECUTION_DRY_RUN'
  | 'FINBOT_QUERY'
  | 'FINBOT_RESPONSE'
  | 'FINBOT_REFUSAL'
  | 'PORTFOLIO_INGESTED'
  | 'PORTFOLIO_CLEARED'
  | 'PRICE_UPDATE'
  | 'SIGNAL_UPDATE'
  | 'SYSTEM_ERROR'
  // Phase 35+
  | 'HUMAN_OVERRIDE'
  | 'OVERRIDE_FAILED'
  | 'OVERRIDE_GUARD_FAILED'
  // Phase 36+
  | 'RECONSTRUCTION_FAILED'
  // Phase 37+
  | 'AUDIT_MODE_ENABLED'
  | 'AUDIT_MODE_DISABLED'
  | 'AUDIT_MODE_VIOLATION'
  | 'FORENSIC_PACK_CREATED'
  | 'FORENSIC_RECONSTRUCTION'
  | 'LIFECYCLE_TRANSITION'
  | 'ETHICS_VERDICT'
  | 'CONFLICT_RESOLVED'
  | 'HUMAN_OVERRIDE_BLOCKED'
  // Phase 38+
  | 'SELF_LIMIT_EVENT'
  | 'CENTRALITY_RISK_CRITICAL'
  | 'INFLUENCE_BUDGET_EXHAUSTED'
  // Phase 38.5+
  | 'AUTHORITY_WALKTHROUGH'
  | 'KILLSWITCH_TEST'
  | 'REALITY_CONVERGENCE'
  // Phase 39+
  | 'SYSTEM_SHUTDOWN'
  | 'SHUTDOWN_VIOLATION_ATTEMPT'
  | 'SHUTDOWN_DEMO'
  // Phase 40+
  | 'CONSTITUTION_VERIFICATION'
  | 'REPLAY_BUNDLE_GENERATED'
  | 'JURISDICTION_SHUTDOWN'
  | 'FINAL_PROOF'
  // Phase 41+
  | 'HOSTILITY_SIMULATION'
  | 'REPLAY_INTEGRITY_CHECK'
  | 'FULL_VERIFICATION'
  // Phase 42+
  | 'POSITION_ASSESSED'
  | 'DAILY_RECONCILIATION'
  | 'EXECUTION_MODE_CHANGED'
  | 'DAILY_EXECUTION'
  | 'EXECUTION_BLOCKED'
  | 'ORDER_EXECUTED'
  // Phase 43+ (Policy and shaping)
  | 'POLICY_UPDATE'
  | 'SHAPING_DECISION'
  | 'ADOPTION_LIFT'
  | 'COGNITIVE_LOAD'
  | 'QUESTION_OUTCOME';

// Severity levels
export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'DEBUG';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  // Immutable identifier
  id: string;
  
  // Timestamps
  timestamp: string;       // ISO format
  timestamp_ms: number;    // Unix milliseconds for ordering
  
  // Event type
  event_type: AuditEventType;
  severity: AuditSeverity;
  
  // Context
  context_id?: string;     // DecisionContext ID if applicable
  session_id: string;      // Browser session ID
  
  // Event data
  summary: string;         // Human-readable summary
  details: Record<string, unknown>;  // Structured data
  
  // Actors
  actor: 'SYSTEM' | 'USER' | 'FINBOT' | 'ENGINE' | 'GUARD' | 'OVERRIDE_PROTOCOL' | 'OVERRIDE_GUARD' | 'HUMAN' | 'OWNER' | 'COURT' | 'REGULATOR' | 'AUDITOR' | 'ETHICS_GUARD' | 'ETHICS_FIREWALL' | 'SHUTDOWN';
  
  // Related entries
  parent_id?: string;      // For linked events
  related_ids?: string[];  // Other related entries
  
  // Integrity
  checksum: string;        // For tamper detection
  previous_checksum?: string;  // Chain integrity
}

/**
 * Audit query options
 */
export interface AuditQueryOptions {
  event_types?: AuditEventType[];
  severity?: AuditSeverity[];
  start_time?: string;
  end_time?: string;
  context_id?: string;
  symbol?: string;
  limit?: number;
  offset?: number;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  total_entries: number;
  entries_by_type: Record<AuditEventType, number>;
  entries_by_severity: Record<AuditSeverity, number>;
  oldest_entry?: string;
  newest_entry?: string;
  session_start: string;
}

// Storage key
const AUDIT_STORAGE_KEY = 'finvest_audit_log';
const SESSION_ID_KEY = 'finvest_session_id';
const MAX_ENTRIES = 10000;  // Max entries to keep in storage

/**
 * DecisionAuditLog
 * 
 * Immutable audit trail for all system decisions.
 */
export class DecisionAuditLog {
  private static instance: DecisionAuditLog;
  private entries: AuditLogEntry[] = [];
  private sessionId: string;
  private lastChecksum: string = '';

  private constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.loadFromStorage();
    
    // Log session start
    this.log({
      event_type: 'CONTEXT_CREATED',
      severity: 'INFO',
      summary: 'Audit session started',
      details: { session_id: this.sessionId },
      actor: 'SYSTEM'
    });
  }

  static getInstance(): DecisionAuditLog {
    if (!DecisionAuditLog.instance) {
      DecisionAuditLog.instance = new DecisionAuditLog();
    }
    return DecisionAuditLog.instance;
  }

  /**
   * Log an event
   */
  log(params: {
    event_type: AuditEventType;
    severity: AuditSeverity;
    summary: string;
    details: Record<string, unknown>;
    actor: 'SYSTEM' | 'USER' | 'FINBOT' | 'ENGINE' | 'GUARD' | 'OVERRIDE_PROTOCOL' | 'OVERRIDE_GUARD' | 'HUMAN' | 'OWNER' | 'COURT' | 'REGULATOR' | 'AUDITOR' | 'ETHICS_GUARD' | 'ETHICS_FIREWALL' | 'SHUTDOWN';
    context_id?: string;
    parent_id?: string;
    related_ids?: string[];
  }): string {
    const now = new Date();
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: now.toISOString(),
      timestamp_ms: now.getTime(),
      event_type: params.event_type,
      severity: params.severity,
      context_id: params.context_id,
      session_id: this.sessionId,
      summary: params.summary,
      details: this.sanitizeDetails(params.details),
      actor: params.actor,
      parent_id: params.parent_id,
      related_ids: params.related_ids,
      checksum: '',
      previous_checksum: this.lastChecksum
    };

    // Calculate checksum for integrity
    entry.checksum = this.calculateChecksum(entry);
    this.lastChecksum = entry.checksum;

    // Add to log (immutable - never modify existing entries)
    this.entries.push(Object.freeze(entry));

    // Persist to storage
    this.saveToStorage();

    return entry.id;
  }

  // Convenience methods for common events

  /**
   * Log a recommendation
   */
  logRecommendation(params: {
    symbol: string;
    action: string;
    quantity: number;
    reasoning: string[];
    context_id?: string;
  }): string {
    return this.log({
      event_type: 'RECOMMENDATION_GENERATED',
      severity: 'INFO',
      summary: `${params.action} recommendation for ${params.symbol}`,
      details: {
        symbol: params.symbol,
        action: params.action,
        quantity: params.quantity,
        reasoning: params.reasoning
      },
      actor: 'ENGINE',
      context_id: params.context_id
    });
  }

  /**
   * Log a tax calculation
   */
  logTaxCalculation(params: {
    symbol: string;
    holding_days: number;
    is_ltcg: boolean;
    gain: number;
    tax: number;
    context_id?: string;
  }): string {
    return this.log({
      event_type: 'TAX_CALCULATION',
      severity: 'INFO',
      summary: `Tax calculated for ${params.symbol}: ₹${params.tax.toLocaleString()} (${params.is_ltcg ? 'LTCG' : 'STCG'})`,
      details: params,
      actor: 'ENGINE',
      context_id: params.context_id
    });
  }

  /**
   * Log user confirmation
   */
  logUserConfirmation(params: {
    action: string;
    symbol: string;
    quantity: number;
    recommendation_id: string;
  }): string {
    return this.log({
      event_type: 'USER_CONFIRMATION',
      severity: 'INFO',
      summary: `User confirmed ${params.action} ${params.quantity} ${params.symbol}`,
      details: params,
      actor: 'USER',
      parent_id: params.recommendation_id
    });
  }

  /**
   * Log user rejection
   */
  logUserRejection(params: {
    action: string;
    symbol: string;
    reason?: string;
    recommendation_id: string;
  }): string {
    return this.log({
      event_type: 'USER_REJECTION',
      severity: 'INFO',
      summary: `User rejected ${params.action} for ${params.symbol}`,
      details: params,
      actor: 'USER',
      parent_id: params.recommendation_id
    });
  }

  /**
   * Log execution attempt
   */
  logExecutionAttempt(params: {
    symbol: string;
    action: string;
    quantity: number;
    is_dry_run: boolean;
    result: 'SUCCESS' | 'BLOCKED' | 'FAILED';
    reason?: string;
  }): string {
    const eventType = params.is_dry_run 
      ? 'EXECUTION_DRY_RUN' 
      : params.result === 'BLOCKED' 
        ? 'EXECUTION_BLOCKED' 
        : 'EXECUTION_ATTEMPT';

    const severity = params.result === 'FAILED' ? 'ERROR' : 'INFO';

    return this.log({
      event_type: eventType,
      severity,
      summary: params.is_dry_run 
        ? `Dry-run: ${params.action} ${params.quantity} ${params.symbol}`
        : `${params.result}: ${params.action} ${params.quantity} ${params.symbol}`,
      details: params,
      actor: 'ENGINE'
    });
  }

  /**
   * Log FinBot query
   */
  logFinBotQuery(query: string): string {
    return this.log({
      event_type: 'FINBOT_QUERY',
      severity: 'INFO',
      summary: `FinBot query: "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`,
      details: { query },
      actor: 'USER'
    });
  }

  /**
   * Log FinBot response
   */
  logFinBotResponse(params: {
    query_id: string;
    confidence: string;
    data_used: string[];
    refused: boolean;
    refusal_reason?: string;
  }): string {
    return this.log({
      event_type: params.refused ? 'FINBOT_REFUSAL' : 'FINBOT_RESPONSE',
      severity: params.refused ? 'WARNING' : 'INFO',
      summary: params.refused 
        ? `FinBot refused: ${params.refusal_reason}`
        : `FinBot responded with ${params.confidence} confidence`,
      details: params,
      actor: 'FINBOT',
      parent_id: params.query_id
    });
  }

  /**
   * Log portfolio ingestion
   */
  logPortfolioIngested(params: {
    source: string;
    holdings_count: number;
    total_value: number;
  }): string {
    return this.log({
      event_type: 'PORTFOLIO_INGESTED',
      severity: 'INFO',
      summary: `Portfolio ingested from ${params.source}: ${params.holdings_count} holdings, ₹${params.total_value.toLocaleString()}`,
      details: params,
      actor: 'USER'
    });
  }

  /**
   * Log system error
   */
  logError(params: {
    component: string;
    error: string;
    stack?: string;
  }): string {
    return this.log({
      event_type: 'SYSTEM_ERROR',
      severity: 'ERROR',
      summary: `Error in ${params.component}: ${params.error}`,
      details: params,
      actor: 'SYSTEM'
    });
  }

  /**
   * Query audit log
   */
  query(options: AuditQueryOptions = {}): AuditLogEntry[] {
    let results = [...this.entries];

    // Filter by event type
    if (options.event_types && options.event_types.length > 0) {
      results = results.filter(e => options.event_types!.includes(e.event_type));
    }

    // Filter by severity
    if (options.severity && options.severity.length > 0) {
      results = results.filter(e => options.severity!.includes(e.severity));
    }

    // Filter by time range
    if (options.start_time) {
      const startMs = new Date(options.start_time).getTime();
      results = results.filter(e => e.timestamp_ms >= startMs);
    }
    if (options.end_time) {
      const endMs = new Date(options.end_time).getTime();
      results = results.filter(e => e.timestamp_ms <= endMs);
    }

    // Filter by context
    if (options.context_id) {
      results = results.filter(e => e.context_id === options.context_id);
    }

    // Filter by symbol
    if (options.symbol) {
      results = results.filter(e => {
        const details = e.details as Record<string, unknown>;
        return details.symbol === options.symbol;
      });
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp_ms - a.timestamp_ms);

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get statistics
   */
  getStats(): AuditStats {
    const entriesByType: Record<AuditEventType, number> = {} as Record<AuditEventType, number>;
    const entriesBySeverity: Record<AuditSeverity, number> = {
      'INFO': 0, 'WARNING': 0, 'ERROR': 0, 'CRITICAL': 0
    };

    for (const entry of this.entries) {
      entriesByType[entry.event_type] = (entriesByType[entry.event_type] || 0) + 1;
      entriesBySeverity[entry.severity]++;
    }

    return {
      total_entries: this.entries.length,
      entries_by_type: entriesByType,
      entries_by_severity: entriesBySeverity,
      oldest_entry: this.entries[0]?.timestamp,
      newest_entry: this.entries[this.entries.length - 1]?.timestamp,
      session_start: this.entries.find(e => e.summary === 'Audit session started')?.timestamp || ''
    };
  }

  /**
   * Export audit log (for compliance/review)
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Get events for a specific snapshot (Phase 37)
   */
  getEventsForSnapshot(snapshotId: string): AuditLogEntry[] {
    return this.entries.filter(e => {
      // Check context_id
      if (e.context_id === snapshotId) return true;
      // Check details
      const details = e.details as Record<string, unknown>;
      if (details.snapshot_id === snapshotId) return true;
      if (details.snapshotId === snapshotId) return true;
      return false;
    });
  }

  /**
   * Get recent events (Phase 37)
   */
  getRecentEvents(limit: number = 10): AuditLogEntry[] {
    return [...this.entries]
      .sort((a, b) => b.timestamp_ms - a.timestamp_ms)
      .slice(0, limit);
  }

  /**
   * Get all entries (Phase 37)
   */
  getAllEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get all events (alias for getAllEntries)
   */
  getAllEvents(): AuditLogEntry[] {
    return this.getAllEntries();
  }

  /**
   * Verify log integrity
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let previousChecksum = '';

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // Verify checksum chain
      if (entry.previous_checksum !== previousChecksum) {
        errors.push(`Entry ${entry.id}: checksum chain broken`);
      }

      // Verify entry checksum
      const expectedChecksum = this.calculateChecksum(entry);
      if (entry.checksum !== expectedChecksum) {
        errors.push(`Entry ${entry.id}: checksum mismatch (tampered?)`);
      }

      previousChecksum = entry.checksum;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Private methods

  private generateId(): string {
    return `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  }

  private calculateChecksum(entry: AuditLogEntry): string {
    // Simple checksum using entry data
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      event_type: entry.event_type,
      summary: entry.summary,
      details: entry.details,
      previous_checksum: entry.previous_checksum
    });

    // Simple hash function (in production, use crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    // Remove sensitive data, limit depth, etc.
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      // Skip functions
      if (typeof value === 'function') continue;
      
      // Limit string length
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.slice(0, 1000) + '...[truncated]';
      } else if (typeof value === 'object' && value !== null) {
        // Limit object depth
        sanitized[key] = JSON.parse(JSON.stringify(value));
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.entries = parsed.map(e => Object.freeze(e));
          // Update last checksum
          if (this.entries.length > 0) {
            this.lastChecksum = this.entries[this.entries.length - 1].checksum;
          }
        }
      }
    } catch (e) {
      console.error('[AuditLog] Failed to load from storage:', e);
    }
  }

  private saveToStorage(): void {
    try {
      // Limit entries to prevent storage overflow
      let entriesToSave = this.entries;
      if (entriesToSave.length > MAX_ENTRIES) {
        entriesToSave = entriesToSave.slice(-MAX_ENTRIES);
      }
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entriesToSave));
    } catch (e) {
      console.error('[AuditLog] Failed to save to storage:', e);
    }
  }
}

// Export singleton
export const auditLog = DecisionAuditLog.getInstance();

export default DecisionAuditLog;

