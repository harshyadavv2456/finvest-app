/**
 * Portfolio Ingestion Module
 * 
 * Central module for ingesting portfolio data from various sources:
 * - CAMS Consolidated Account Statement (CAS) - Mutual Funds
 * - CDSL Easiest / EasiestEST - Equity Holdings
 * - NSDL CAS - Equity Holdings (placeholder)
 * 
 * RULES:
 * - NO mock data
 * - NO simulation
 * - Read-only snapshots only
 * - Versioned by date
 * - No mutation allowed
 */

import { 
  PortfolioSnapshot, 
  IngestionResult, 
  IngestionSource,
  PortfolioState
} from './types';
import { parseCAMSCSV } from './parsers/CAMSParser';
import { parseCDSLCSV, generateCDSLTemplate } from './parsers/CDSLParser';

// Storage key for portfolio snapshots
const PORTFOLIO_STORAGE_KEY = 'finvest_portfolio_snapshots';
const CURRENT_SNAPSHOT_KEY = 'finvest_current_snapshot';

/**
 * Portfolio Ingestion Service
 * Handles parsing, validation, and storage of portfolio data
 */
export class PortfolioIngestion {
  private static instance: PortfolioIngestion;
  private currentSnapshot: PortfolioSnapshot | null = null;
  private snapshots: Map<string, PortfolioSnapshot> = new Map();

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): PortfolioIngestion {
    if (!PortfolioIngestion.instance) {
      PortfolioIngestion.instance = new PortfolioIngestion();
    }
    return PortfolioIngestion.instance;
  }

  /**
   * Ingest portfolio from file
   */
  async ingestFromFile(file: File, source: IngestionSource): Promise<IngestionResult> {
    try {
      const content = await this.readFile(file);
      return this.ingestFromContent(content, source);
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        warnings: []
      };
    }
  }

  /**
   * Ingest portfolio from CSV/text content
   */
  ingestFromContent(content: string, source: IngestionSource): IngestionResult {
    let result: IngestionResult;

    switch (source) {
      case 'CAMS_CAS':
        result = parseCAMSCSV(content);
        break;
      case 'CDSL_EASIEST':
        result = parseCDSLCSV(content);
        break;
      case 'NSDL_CAS':
        // Placeholder for NSDL parser
        result = {
          success: false,
          error: 'NSDL CAS parsing is not yet supported. Please use CDSL Easiest or manual CSV.',
          warnings: ['NSDL_CAS: NOT_AVAILABLE - Parser not implemented']
        };
        break;
      case 'MANUAL_CSV':
        // Manual CSV follows CDSL format
        result = parseCDSLCSV(content);
        if (result.success && result.snapshot) {
          result.snapshot.source = 'MANUAL_CSV';
        }
        break;
      default:
        result = {
          success: false,
          error: `Unsupported ingestion source: ${source}`,
          warnings: []
        };
    }

    // Store successful ingestion
    if (result.success && result.snapshot) {
      this.storeSnapshot(result.snapshot);
    }

    return result;
  }

  /**
   * Get current portfolio snapshot
   */
  getCurrentSnapshot(): PortfolioSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Get portfolio state for UI
   */
  getPortfolioState(): PortfolioState {
    if (!this.currentSnapshot) {
      return {
        status: 'NOT_CONNECTED',
        reason: 'No portfolio data ingested. Please upload your CAMS CAS, CDSL Easiest, or manual CSV file.'
      };
    }

    return {
      status: 'READY',
      snapshot: this.currentSnapshot
    };
  }

  /**
   * Get all historical snapshots
   */
  getSnapshots(): PortfolioSnapshot[] {
    return Array.from(this.snapshots.values()).sort((a, b) => 
      new Date(b.ingested_at).getTime() - new Date(a.ingested_at).getTime()
    );
  }

  /**
   * Get snapshot by version
   */
  getSnapshotByVersion(version: string): PortfolioSnapshot | null {
    return this.snapshots.get(version) || null;
  }

  /**
   * Clear all portfolio data
   */
  clearPortfolio(): void {
    this.currentSnapshot = null;
    this.snapshots.clear();
    localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
    localStorage.removeItem(CURRENT_SNAPSHOT_KEY);
  }

  /**
   * Get CSV template for manual entry
   */
  getCSVTemplate(): string {
    return generateCDSLTemplate();
  }

  /**
   * Download CSV template
   */
  downloadCSVTemplate(): void {
    const template = this.getCSVTemplate();
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finvest_portfolio_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Private methods

  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          resolve(content);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsText(file);
    });
  }

  private storeSnapshot(snapshot: PortfolioSnapshot): void {
    // Store in memory
    this.currentSnapshot = snapshot;
    this.snapshots.set(snapshot.version, snapshot);

    // Persist to localStorage
    try {
      const snapshotsArray = Array.from(this.snapshots.values());
      localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(snapshotsArray));
      localStorage.setItem(CURRENT_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to persist portfolio snapshot:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      // Load current snapshot
      const currentJson = localStorage.getItem(CURRENT_SNAPSHOT_KEY);
      if (currentJson) {
        this.currentSnapshot = JSON.parse(currentJson);
      }

      // Load all snapshots
      const snapshotsJson = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (snapshotsJson) {
        const snapshotsArray: PortfolioSnapshot[] = JSON.parse(snapshotsJson);
        snapshotsArray.forEach(s => {
          this.snapshots.set(s.version, s);
        });
      }
    } catch (error) {
      console.error('Failed to load portfolio from storage:', error);
    }
  }
}

// Export singleton instance
export const portfolioIngestion = PortfolioIngestion.getInstance();

export default PortfolioIngestion;

