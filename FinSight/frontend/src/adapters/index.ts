/**
 * Data Adapters - Frontend Data Layer
 * 
 * PHASE 43: Frontend Product Surface
 * 
 * All adapters for reading data from backend/JSON files.
 * UI components should only import from this module.
 */

export {
  PositionDataAdapter,
  usePositionData,
  type PositionData,
  type PositionDecision,
  type DailyAssessmentSummary,
  type PositionsFile,
  type TimelineEntry,
  type PositionTimeline,
  type LoadResult
} from './PositionDataAdapter';

