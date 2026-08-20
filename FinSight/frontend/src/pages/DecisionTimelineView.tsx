/**
 * DecisionTimelineView - Read-Only Decision Timeline
 * 
 * PHASE 27: Market-Reality Feedback Loop (MRFL)
 * 
 * PURPOSE:
 * Show: Decision → Market events → Outcome
 * 
 * RULES:
 * - READ-ONLY (no modifications)
 * - No charts without numbers
 * - No narratives without data
 * - "What changed, when, and why"
 */

import React, { useState, useEffect } from 'react';
import { getDecisionAgingEngine, DecisionAging } from '../feedback/DecisionAgingEngine';
import { getThesisValidator, ThesisAssessment, FailureMode } from '../feedback/ThesisValidator';
import { getConfidenceHonestyIndex, HonestyIndex, ConfidenceOutcome } from '../feedback/ConfidenceHonestyIndex';
import { getMarketTimeline } from '../core/MarketTimeline';
import { MarketEvent } from '../core/MarketEvent';
import { getSnapshotAuthority } from '../core/SnapshotAuthority';

// =============================================================================
// TYPES
// =============================================================================

interface TimelineEntry {
  date: string;
  type: 'DECISION' | 'MARKET_EVENT' | 'PRICE_CHANGE' | 'THESIS_CHANGE';
  symbol: string;
  title: string;
  details: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  data: Record<string, unknown>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DecisionTimelineView: React.FC = () => {
  const [agingRecords, setAgingRecords] = useState<DecisionAging[]>([]);
  const [assessments, setAssessments] = useState<ThesisAssessment[]>([]);
  const [honestyIndex, setHonestyIndex] = useState<HonestyIndex | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    loadData();
  }, []);
  
  useEffect(() => {
    if (selectedSnapshot) {
      buildTimeline(selectedSnapshot);
    }
  }, [selectedSnapshot]);
  
  const loadData = () => {
    try {
      const agingEngine = getDecisionAgingEngine();
      const validator = getThesisValidator();
      const honesty = getConfidenceHonestyIndex();
      
      setAgingRecords(agingEngine.getAllAgingRecords());
      setAssessments(validator.getAllAssessments());
      
      try {
        const index = honesty.getLatestIndex();
        setHonestyIndex(index);
      } catch {
        // No honesty index yet
      }
      
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
      setLoading(false);
    }
  };
  
  const buildTimeline = (snapshotId: string) => {
    const entries: TimelineEntry[] = [];
    const snapshotAuthority = getSnapshotAuthority();
    const marketTimeline = getMarketTimeline();
    
    const validation = snapshotAuthority.validateSnapshot(snapshotId);
    const snapshot = validation.valid ? validation.snapshot : null;
    const aging = agingRecords.find(a => a.snapshot_id === snapshotId);
    const assessment = assessments.find(a => a.snapshot_id === snapshotId);
    
    if (!snapshot || !aging) {
      setTimeline([]);
      return;
    }
    
    const output = snapshot.outputs[0];
    const symbol = output?.symbol || 'UNKNOWN';
    
    // 1. Decision entry
    entries.push({
      date: snapshot.created_at,
      type: 'DECISION',
      symbol,
      title: `${output?.action} ${symbol}`,
      details: `Confidence: ${output?.confidence}% | Expected: ${output?.expected_return?.toFixed(1) || 'N/A'}%`,
      impact: 'NEUTRAL',
      data: {
        confidence: output?.confidence,
        expected_return: output?.expected_return,
        action: output?.action
      }
    });
    
    // 2. Market events
    const events = marketTimeline.getEventsBySymbol(symbol);
    for (const event of events) {
      if (new Date(event.timestamp) <= new Date(snapshot.created_at)) continue;
      if (new Date(event.timestamp) > new Date(aging.last_price_date)) continue;
      
      entries.push({
        date: event.timestamp,
        type: 'MARKET_EVENT',
        symbol,
        title: event.type.replace(/_/g, ' '),
        details: event.description || `Event: ${event.type}`,
        impact: getEventImpact(event, output?.action || 'HOLD'),
        data: {
          event_type: event.type,
          price_before: event.data?.price_before,
          price_after: event.data?.price_after
        }
      });
    }
    
    // 3. Thesis status changes (if assessment exists)
    if (assessment && assessment.failure_mode !== 'NONE') {
      entries.push({
        date: assessment.assessed_at,
        type: 'THESIS_CHANGE',
        symbol,
        title: `Thesis Status: ${aging.thesis_status}`,
        details: `Failure Mode: ${assessment.failure_mode}`,
        impact: aging.thesis_status === 'BROKEN' ? 'NEGATIVE' : 'NEUTRAL',
        data: {
          thesis_status: aging.thesis_status,
          failure_mode: assessment.failure_mode,
          accuracy_score: assessment.thesis_accuracy_score
        }
      });
    }
    
    // 4. Current state
    entries.push({
      date: aging.computed_at,
      type: 'PRICE_CHANGE',
      symbol,
      title: `Current: ${aging.price_change_percent >= 0 ? '+' : ''}${aging.price_change_percent.toFixed(1)}%`,
      details: `Entry: ₹${aging.entry_price.toFixed(2)} → Current: ₹${aging.current_price.toFixed(2)} | Age: ${aging.age_days} days`,
      impact: aging.price_change_percent >= 0 ? 'POSITIVE' : 'NEGATIVE',
      data: {
        entry_price: aging.entry_price,
        current_price: aging.current_price,
        change_percent: aging.price_change_percent,
        age_days: aging.age_days
      }
    });
    
    // Sort by date
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    setTimeline(entries);
  };
  
  const getEventImpact = (event: MarketEvent, action: string): TimelineEntry['impact'] => {
    const isBullish = action === 'BUY' || action === 'HOLD';
    
    const positiveEvents = ['EARNINGS_BEAT', 'GUIDANCE_RAISE', 'ANALYST_UPGRADE'];
    const negativeEvents = ['EARNINGS_MISS', 'GUIDANCE_CUT', 'ANALYST_DOWNGRADE'];
    
    if (positiveEvents.includes(event.type)) {
      return isBullish ? 'POSITIVE' : 'NEGATIVE';
    }
    
    if (negativeEvents.includes(event.type)) {
      return isBullish ? 'NEGATIVE' : 'POSITIVE';
    }
    
    return 'NEUTRAL';
  };
  
  const getThesisStatusColor = (status: string) => {
    switch (status) {
      case 'HOLDING': return 'text-green-400';
      case 'DECAYING': return 'text-yellow-400';
      case 'BROKEN': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };
  
  const getFailureModeLabel = (mode: FailureMode) => {
    switch (mode) {
      case 'TIMING': return 'Timing Issue';
      case 'RISK_UNDERESTIMATED': return 'Risk Underestimated';
      case 'THESIS_WRONG': return 'Thesis Wrong';
      case 'EXTERNAL_SHOCK': return 'External Shock';
      case 'NONE': return 'No Failure';
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <p>Loading decision timeline...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Error</h1>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Decision Timeline</h1>
        <p className="text-gray-400 mt-2">
          Market-Reality Feedback Loop: What changed, when, and why
        </p>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Aged</p>
          <p className="text-2xl font-bold">{agingRecords.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Holding</p>
          <p className="text-2xl font-bold text-green-400">
            {agingRecords.filter(a => a.thesis_status === 'HOLDING').length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Decaying</p>
          <p className="text-2xl font-bold text-yellow-400">
            {agingRecords.filter(a => a.thesis_status === 'DECAYING').length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Broken</p>
          <p className="text-2xl font-bold text-red-400">
            {agingRecords.filter(a => a.thesis_status === 'BROKEN').length}
          </p>
        </div>
      </div>
      
      {/* Honesty Index */}
      {honestyIndex && (
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Confidence Honesty</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-sm">Overall Score</p>
              <p className="text-2xl font-bold">{honestyIndex.overall_honesty_score}/100</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Calibration</p>
              <p className="text-2xl font-bold">{honestyIndex.calibration_score}/100</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Overconfidence Penalty</p>
              <p className="text-2xl font-bold text-red-400">-{honestyIndex.overconfidence_penalty}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Underconfidence Bonus</p>
              <p className="text-2xl font-bold text-green-400">+{honestyIndex.underconfidence_bonus}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Decision List */}
      <div className="grid grid-cols-3 gap-8">
        {/* Left: Decision List */}
        <div className="col-span-1 bg-gray-800 rounded-lg p-4 max-h-[600px] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Decisions</h2>
          {agingRecords.length === 0 ? (
            <p className="text-gray-400">No aged decisions yet</p>
          ) : (
            <div className="space-y-2">
              {agingRecords.map(aging => (
                <button
                  key={aging.id}
                  onClick={() => setSelectedSnapshot(aging.snapshot_id)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedSnapshot === aging.snapshot_id 
                      ? 'bg-blue-600' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{aging.symbol}</span>
                    <span className={getThesisStatusColor(aging.thesis_status)}>
                      {aging.thesis_status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {aging.age_days} days | {aging.price_change_percent >= 0 ? '+' : ''}{aging.price_change_percent.toFixed(1)}%
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Right: Timeline */}
        <div className="col-span-2">
          {selectedSnapshot ? (
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-6">Timeline</h2>
              
              {timeline.length === 0 ? (
                <p className="text-gray-400">No timeline data available</p>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-600" />
                  
                  {/* Timeline entries */}
                  <div className="space-y-6">
                    {timeline.map((entry, idx) => (
                      <div key={idx} className="relative pl-12">
                        {/* Dot */}
                        <div className={`absolute left-2 w-4 h-4 rounded-full ${
                          entry.impact === 'POSITIVE' ? 'bg-green-500' :
                          entry.impact === 'NEGATIVE' ? 'bg-red-500' :
                          'bg-gray-500'
                        }`} />
                        
                        {/* Content */}
                        <div className="bg-gray-700 rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                entry.type === 'DECISION' ? 'bg-blue-600' :
                                entry.type === 'MARKET_EVENT' ? 'bg-purple-600' :
                                entry.type === 'THESIS_CHANGE' ? 'bg-orange-600' :
                                'bg-gray-600'
                              }`}>
                                {entry.type.replace(/_/g, ' ')}
                              </span>
                              <h3 className="font-semibold mt-2">{entry.title}</h3>
                              <p className="text-gray-400 text-sm mt-1">{entry.details}</p>
                            </div>
                            <span className="text-sm text-gray-400">
                              {new Date(entry.date).toLocaleDateString()}
                            </span>
                          </div>
                          
                          {/* Data */}
                          {Object.keys(entry.data).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-600">
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                {Object.entries(entry.data).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="text-gray-400">{key.replace(/_/g, ' ')}: </span>
                                    <span className="text-white">
                                      {typeof value === 'number' 
                                        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                        : String(value)
                                      }
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Assessment Summary */}
              {assessments.find(a => a.snapshot_id === selectedSnapshot) && (
                <div className="mt-6 p-4 bg-gray-700 rounded-lg">
                  <h3 className="font-semibold mb-3">Thesis Assessment</h3>
                  {(() => {
                    const assessment = assessments.find(a => a.snapshot_id === selectedSnapshot)!;
                    return (
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Accuracy: </span>
                          <span className="font-medium">{assessment.thesis_accuracy_score}/100</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Failure Mode: </span>
                          <span className="font-medium">{getFailureModeLabel(assessment.failure_mode)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Quality: </span>
                          <span className="font-medium">{assessment.thesis_quality}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Risk Quality: </span>
                          <span className="font-medium">{assessment.risk_assessment_quality}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Expected Return: </span>
                          <span className="font-medium">{assessment.expected_return.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Realized Return: </span>
                          <span className={`font-medium ${assessment.realized_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {assessment.realized_return >= 0 ? '+' : ''}{assessment.realized_return.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Was Timing Issue: </span>
                          <span className="font-medium">{assessment.was_timing_issue ? 'Yes' : 'No'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Peak Achieved: </span>
                          <span className="font-medium">+{assessment.peak_return_achieved.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 flex items-center justify-center h-64">
              <p className="text-gray-400">Select a decision to view its timeline</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DecisionTimelineView;

