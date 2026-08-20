/**
 * Position Entity - Core Live Holding
 * 
 * PHASE 42: Position Continuity & Autonomous Execution
 * 
 * A Position represents a LIVE HOLDING that:
 * - Persists across days
 * - Has memory of why it exists
 * - Receives exactly ONE decision per day
 * - Is IMMUTABLE per update cycle (append-only versioning)
 */

// =============================================================================
// POSITION TYPES
// =============================================================================

/**
 * Position lifecycle states
 */
export type PositionLifecycleState = 
  | 'OPEN'      // Position is active
  | 'REDUCING'  // Position is being reduced
  | 'CLOSED';   // Position is fully closed

/**
 * Daily decision for a position
 */
export type PositionDecision = 
  | 'INITIATE'  // Open position now
  | 'HOLD'      // Do nothing, explicitly
  | 'REDUCE'    // Partial exit (risk/tax driven)
  | 'EXIT'      // Close position
  | 'AVOID';    // Do not initiate / do not add

/**
 * Tax lot information
 */
export interface TaxLotInfo {
  readonly lot_id: string;
  readonly quantity: number;
  readonly purchase_date: string;          // ISO date
  readonly purchase_price: number;
  readonly days_held: number;
  readonly is_ltcg_eligible: boolean;      // > 365 days
  readonly days_to_ltcg: number;           // Days until LTCG eligibility
  readonly unrealized_gain_loss: number;
  readonly tax_implication: 'STCG' | 'LTCG' | 'LOSS';
}

/**
 * Risk allocation for a position
 */
export interface PositionRiskAllocation {
  readonly risk_units: number;              // Normalized risk score
  readonly max_loss_allowed: number;        // ₹ maximum loss
  readonly current_drawdown: number;        // Current % down from peak
  readonly stop_loss_price: number;         // Auto-exit price
  readonly position_size_percent: number;   // % of portfolio
}

/**
 * Core Position Entity
 */
export interface Position {
  readonly position_id: string;
  readonly version: number;                 // Increment on each update
  
  // Origin
  readonly snapshot_id_origin: string;      // Decision that created this
  readonly entry_rationale_hash: string;    // Hash of original reasoning
  
  // Identity
  readonly symbol: string;
  readonly demat_account_id: string;
  readonly exchange: 'NSE' | 'BSE';
  
  // Holdings
  readonly quantity: number;
  readonly average_cost: number;
  readonly entry_date: string;              // ISO date
  readonly current_price: number;
  readonly current_value: number;
  readonly unrealized_pnl: number;
  readonly unrealized_pnl_percent: number;
  
  // Tax
  readonly tax_lots: readonly TaxLotInfo[];
  readonly total_tax_liability_if_sold: number;
  
  // Risk
  readonly risk_allocation: PositionRiskAllocation;
  
  // State
  readonly lifecycle_state: PositionLifecycleState;
  readonly last_decision: PositionDecision;
  readonly last_decision_date: string;
  readonly last_decision_reason: string;
  
  // Audit
  readonly created_at: string;
  readonly updated_at: string;
  readonly _frozen: true;
}

/**
 * Position creation input
 */
export interface CreatePositionInput {
  readonly snapshot_id_origin: string;
  readonly entry_rationale_hash: string;
  readonly symbol: string;
  readonly demat_account_id: string;
  readonly exchange: 'NSE' | 'BSE';
  readonly quantity: number;
  readonly average_cost: number;
  readonly entry_date: string;
  readonly current_price: number;
  readonly risk_allocation: PositionRiskAllocation;
}

/**
 * Position update input (for version increment)
 */
export interface UpdatePositionInput {
  readonly position_id: string;
  readonly current_price: number;
  readonly quantity?: number;               // If reduced
  readonly lifecycle_state?: PositionLifecycleState;
  readonly decision: PositionDecision;
  readonly decision_reason: string;
}

// =============================================================================
// POSITION FACTORY
// =============================================================================

export class PositionFactory {
  private static idCounter = 0;
  
  /**
   * Create a new position
   */
  public static create(input: CreatePositionInput): Position {
    const positionId = `POS-${Date.now()}-${++this.idCounter}`;
    const now = new Date().toISOString();
    
    const currentValue = input.quantity * input.current_price;
    const unrealizedPnl = currentValue - (input.quantity * input.average_cost);
    const unrealizedPnlPercent = (unrealizedPnl / (input.quantity * input.average_cost)) * 100;
    
    // Create initial tax lot
    const taxLot: TaxLotInfo = Object.freeze({
      lot_id: `LOT-${positionId}-1`,
      quantity: input.quantity,
      purchase_date: input.entry_date,
      purchase_price: input.average_cost,
      days_held: 0,
      is_ltcg_eligible: false,
      days_to_ltcg: 365,
      unrealized_gain_loss: unrealizedPnl,
      tax_implication: unrealizedPnl >= 0 ? 'STCG' : 'LOSS'
    });
    
    const position: Position = Object.freeze({
      position_id: positionId,
      version: 1,
      snapshot_id_origin: input.snapshot_id_origin,
      entry_rationale_hash: input.entry_rationale_hash,
      symbol: input.symbol,
      demat_account_id: input.demat_account_id,
      exchange: input.exchange,
      quantity: input.quantity,
      average_cost: input.average_cost,
      entry_date: input.entry_date,
      current_price: input.current_price,
      current_value: currentValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_percent: unrealizedPnlPercent,
      tax_lots: Object.freeze([taxLot]),
      total_tax_liability_if_sold: this.calculateTaxLiability([taxLot]),
      risk_allocation: Object.freeze(input.risk_allocation),
      lifecycle_state: 'OPEN',
      last_decision: 'INITIATE',
      last_decision_date: now.split('T')[0],
      last_decision_reason: 'Initial position entry',
      created_at: now,
      updated_at: now,
      _frozen: true
    });
    
    return position;
  }
  
  /**
   * Create new version of position (append-only)
   */
  public static update(
    existing: Position, 
    input: UpdatePositionInput,
    newPrice: number
  ): Position {
    if (existing.lifecycle_state === 'CLOSED') {
      throw new Error('POSITION_CLOSED: Cannot update a closed position');
    }
    
    const now = new Date().toISOString();
    const newQuantity = input.quantity ?? existing.quantity;
    const currentValue = newQuantity * newPrice;
    const unrealizedPnl = currentValue - (newQuantity * existing.average_cost);
    const unrealizedPnlPercent = (unrealizedPnl / (newQuantity * existing.average_cost)) * 100;
    
    // Update tax lots with new days held
    const updatedTaxLots = existing.tax_lots.map(lot => {
      const daysHeld = Math.floor(
        (Date.now() - new Date(lot.purchase_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      return Object.freeze({
        ...lot,
        days_held: daysHeld,
        is_ltcg_eligible: daysHeld > 365,
        days_to_ltcg: Math.max(0, 365 - daysHeld),
        unrealized_gain_loss: (newQuantity / existing.quantity) * lot.unrealized_gain_loss,
        tax_implication: daysHeld > 365 
          ? (unrealizedPnl >= 0 ? 'LTCG' : 'LOSS') 
          : (unrealizedPnl >= 0 ? 'STCG' : 'LOSS')
      } as TaxLotInfo);
    });
    
    const newState = input.lifecycle_state ?? existing.lifecycle_state;
    
    const updatedPosition: Position = Object.freeze({
      position_id: existing.position_id,
      version: existing.version + 1,
      snapshot_id_origin: existing.snapshot_id_origin,
      entry_rationale_hash: existing.entry_rationale_hash,
      symbol: existing.symbol,
      demat_account_id: existing.demat_account_id,
      exchange: existing.exchange,
      quantity: newQuantity,
      average_cost: existing.average_cost,
      entry_date: existing.entry_date,
      current_price: newPrice,
      current_value: currentValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_percent: unrealizedPnlPercent,
      tax_lots: Object.freeze(updatedTaxLots),
      total_tax_liability_if_sold: this.calculateTaxLiability(updatedTaxLots),
      risk_allocation: existing.risk_allocation,
      lifecycle_state: newState,
      last_decision: input.decision,
      last_decision_date: now.split('T')[0],
      last_decision_reason: input.decision_reason,
      created_at: existing.created_at,
      updated_at: now,
      _frozen: true
    });
    
    return updatedPosition;
  }
  
  /**
   * Calculate tax liability if sold today
   */
  private static calculateTaxLiability(lots: readonly TaxLotInfo[]): number {
    let totalTax = 0;
    
    for (const lot of lots) {
      if (lot.unrealized_gain_loss <= 0) continue;
      
      if (lot.is_ltcg_eligible) {
        // LTCG: 10% above ₹1L exemption (simplified)
        totalTax += lot.unrealized_gain_loss * 0.10;
      } else {
        // STCG: 15%
        totalTax += lot.unrealized_gain_loss * 0.15;
      }
    }
    
    return totalTax;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default Position;

