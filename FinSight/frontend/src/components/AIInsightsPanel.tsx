import { useState, useRef } from 'react';
import { Sparkles, Loader2, AlertCircle, TrendingUp, TrendingDown, Target, Clock, Shield, Download, FileText } from 'lucide-react';
import { api, AIInsightsResponse } from '../lib/api';

interface AIInsightsPanelProps {
  ticker: string;
}

export default function AIInsightsPanel({ ticker }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<AIInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const generateInsights = async () => {
    setLoading(true);
    setInsights(null);
    // Retry until we get a valid response (no error display)
    try {
      const result = await api.getAIInsights(ticker);
      if (result && result.summary && !result.summary.includes('not configured') && !result.summary.includes('failed')) {
        setInsights(result);
        setLoading(false);
      } else {
        // If result looks like an error, retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        generateInsights();
      }
    } catch (err: any) {
      console.log('AI Insights retrying...', err);
      // Retry after delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      generateInsights();
    }
  };

  const exportToPDF = async () => {
    if (!insights) return;

    try {
      // Dynamic import to avoid loading jspdf in initial bundle
      const { default: jsPDF } = await import('jspdf');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const headerHeight = 35;
      let yPos = margin;

      // Premium blue header background
      const addHeader = () => {
        pdf.setFillColor(30, 58, 138); // Premium blue
        pdf.rect(0, 0, pdfWidth, headerHeight, 'F');
        
        // Load and add logo (left side)
        try {
          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          logoImg.src = '/FinSight Logo.jpg';
          
          if (logoImg.complete && logoImg.naturalWidth > 0) {
            const logoWidth = 25;
            const logoHeight = (logoImg.naturalHeight / logoImg.naturalWidth) * logoWidth;
            pdf.addImage(logoImg.src, 'JPEG', margin, (headerHeight - logoHeight) / 2, logoWidth, logoHeight);
          }
        } catch (logoErr) {
          console.warn('Logo failed to load');
        }

        // Title (centered, white text)
        pdf.setFontSize(24);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        const titleText = `${ticker} - AI Analysis Report`;
        const titleWidth = pdf.getTextWidth(titleText);
        pdf.text(titleText, (pdfWidth - titleWidth) / 2, 15);

        // Subtitle
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        const subtitleText = 'FinSight Premium Stock Analysis';
        const subtitleWidth = pdf.getTextWidth(subtitleText);
        pdf.text(subtitleText, (pdfWidth - subtitleWidth) / 2, 22);

        // Date (right side, white text)
        pdf.setFontSize(9);
        const dateText = `Generated: ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`;
        pdf.text(dateText, pdfWidth - margin - pdf.getTextWidth(dateText), 28);
      };

      // Add header to first page
      addHeader();
      yPos = headerHeight + 10;

      // Helper function to add text with word wrap and page breaks
      const addText = (text: string, fontSize: number, isBold: boolean = false, color: [number, number, number] = [0, 0, 0], spacing: number = 3) => {
        pdf.setFontSize(fontSize);
        pdf.setTextColor(color[0], color[1], color[2]);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        
        const maxWidth = pdfWidth - 2 * margin;
        const lines = pdf.splitTextToSize(text, maxWidth);
        
        // Check if we need a new page
        const lineHeight = fontSize * 0.4;
        const neededHeight = lines.length * lineHeight + spacing;
        
        if (yPos + neededHeight > pdfHeight - margin - 10) {
          pdf.addPage();
          addHeader();
          yPos = headerHeight + 10;
        }
        
        pdf.text(lines, margin, yPos);
        yPos += lines.length * lineHeight + spacing;
      };

      // Helper function to add section header with colored background
      const addSectionHeader = (title: string, color: [number, number, number] = [30, 58, 138]) => {
        if (yPos > pdfHeight - 30) {
          pdf.addPage();
          addHeader();
          yPos = headerHeight + 10;
        }
        
        // Colored background for section header
        pdf.setFillColor(color[0], color[1], color[2]);
        pdf.rect(margin, yPos - 5, pdfWidth - 2 * margin, 8, 'F');
        
        pdf.setFontSize(16);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin + 3, yPos + 2);
        yPos += 8;
      };

      // Executive Summary with colored header
      addSectionHeader('Executive Summary', [30, 58, 138]);
      addText(insights.summary || 'No summary available.', 11, false, [30, 30, 30]);
      yPos += 5;

      // Key Investment Points with colored header
      if (insights.key_points && insights.key_points.length > 0) {
        addSectionHeader('Key Investment Points', [59, 130, 246]); // Blue
        insights.key_points.forEach((point, idx) => {
          // Colored bullet points
          pdf.setFillColor(59, 130, 246);
          pdf.circle(margin + 3, yPos - 1, 1.5, 'F');
          addText(`${idx + 1}. ${point}`, 10, false, [40, 40, 40]);
        });
        yPos += 5;
      }

      // Bull Case with green header
      if (insights.bull_case) {
        addSectionHeader('Bull Case - Upside Scenarios', [34, 197, 94]); // Green
        // Light green background for content
        const contentStart = yPos;
        const bullLines = pdf.splitTextToSize(insights.bull_case, pdfWidth - 2 * margin);
        const contentHeight = bullLines.length * 4 + 6;
        pdf.setFillColor(240, 253, 244);
        pdf.rect(margin, contentStart - 2, pdfWidth - 2 * margin, contentHeight, 'F');
        addText(insights.bull_case, 10, false, [20, 80, 40]);
        yPos += 5;
      }

      // Bear Case with red header
      if (insights.bear_case) {
        addSectionHeader('Bear Case - Downside Risks', [239, 68, 68]); // Red
        // Light red background for content
        const contentStart = yPos;
        const bearLines = pdf.splitTextToSize(insights.bear_case, pdfWidth - 2 * margin);
        const contentHeight = bearLines.length * 4 + 6;
        pdf.setFillColor(254, 242, 242);
        pdf.rect(margin, contentStart - 2, pdfWidth - 2 * margin, contentHeight, 'F');
        addText(insights.bear_case, 10, false, [120, 20, 20]);
        yPos += 5;
      }

      // Risk Factors with orange header
      if (insights.risk_factors && insights.risk_factors.length > 0) {
        addSectionHeader('Key Risk Factors', [249, 115, 22]); // Orange
        insights.risk_factors.forEach((risk, idx) => {
          pdf.setFillColor(249, 115, 22);
          pdf.circle(margin + 3, yPos - 1, 1.5, 'F');
          addText(`${idx + 1}. ${risk}`, 10, false, [60, 40, 20]);
        });
        yPos += 5;
      }

      // Metrics to Watch with purple header
      if (insights.metrics_to_watch && insights.metrics_to_watch.length > 0) {
        addSectionHeader('Key Metrics to Monitor', [168, 85, 247]); // Purple
        insights.metrics_to_watch.forEach((metric, idx) => {
          pdf.setFillColor(168, 85, 247);
          pdf.circle(margin + 3, yPos - 1, 1.5, 'F');
          addText(`${idx + 1}. ${metric}`, 10, false, [60, 30, 80]);
        });
        yPos += 5;
      }

      // Time Horizon & Risk Profile in colored boxes
      if (insights.time_horizon && insights.time_horizon !== 'N/A') {
        if (yPos > pdfHeight - 25) {
          pdf.addPage();
          addHeader();
          yPos = headerHeight + 10;
        }
        pdf.setFillColor(59, 130, 246);
        pdf.rect(margin, yPos - 3, (pdfWidth - 2 * margin) / 2 - 5, 8, 'F');
        pdf.setFontSize(10);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Time Horizon', margin + 3, yPos + 2);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(insights.time_horizon, margin + 3, yPos + 6);
        yPos += 10;
      }
      
      if (insights.risk_profile && insights.risk_profile !== 'N/A') {
        if (yPos > pdfHeight - 25) {
          pdf.addPage();
          addHeader();
          yPos = headerHeight + 10;
        }
        pdf.setFillColor(168, 85, 247);
        pdf.rect(pdfWidth / 2 + 5, yPos - 10, (pdfWidth - 2 * margin) / 2 - 5, 8, 'F');
        pdf.setFontSize(10);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Risk Profile', pdfWidth / 2 + 8, yPos - 5);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(insights.risk_profile, pdfWidth / 2 + 8, yPos - 1);
        yPos += 5;
      }

      // Premium footer on all pages
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        // Footer background
        pdf.setFillColor(30, 58, 138);
        pdf.rect(0, pdfHeight - 8, pdfWidth, 8, 'F');
        
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Page ${i} of ${pageCount}`, pdfWidth - margin - pdf.getTextWidth(`Page ${i} of ${pageCount}`), pdfHeight - 4);
        pdf.text('FinSight Premium Stock Analysis | www.fintaxlife.com', margin, pdfHeight - 4);
      }

      pdf.save(`FinSight-AI-Analysis-${ticker}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('Failed to export PDF. Please try again. Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-bloomberg-text flex items-center gap-2">
          <Sparkles size={20} className="text-bloomberg-accent" />
          AI Analysis
        </h3>
        <div className="flex items-center gap-2">
          {insights && (
            <button
              onClick={exportToPDF}
              className="btn-secondary text-sm flex items-center gap-2"
              title="Export to PDF"
            >
              <Download size={16} />
              Export PDF
            </button>
          )}
          <button
            onClick={generateInsights}
            disabled={loading}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </span>
            ) : (
              'Generate Analysis'
            )}
          </button>
        </div>
      </div>

      {insights && (
        <div ref={reportRef} className="space-y-6 bg-bloomberg-dark p-6 rounded-lg">
          {/* Report Header */}
          <div className="border-b border-bloomberg-border pb-4 mb-6">
            <h2 className="text-2xl font-bold text-bloomberg-text mb-2">{ticker} - AI Analysis Report</h2>
            <p className="text-sm text-bloomberg-text-muted">
              Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {/* Summary */}
          <div className="bg-gradient-to-r from-bloomberg-dark to-bloomberg-panel p-6 rounded-lg border border-bloomberg-border">
            <h4 className="text-base font-bold text-bloomberg-text mb-3 uppercase tracking-wide flex items-center gap-2">
              <FileText size={18} />
              Executive Summary
            </h4>
            <p className="text-bloomberg-text text-base leading-relaxed whitespace-pre-line">{insights.summary}</p>
          </div>

          {/* Key Points */}
          {(insights.key_points?.length > 0 || (insights.key_metrics && insights.key_metrics.length > 0)) && (
            <div className="bg-bloomberg-panel p-5 rounded-lg border border-bloomberg-border">
              <h4 className="text-base font-bold text-bloomberg-text mb-4 flex items-center gap-2">
                <Target size={18} />
                Key Investment Points
              </h4>
              <ul className="space-y-3">
                {(insights.key_points || insights.key_metrics || []).map((point, idx) => (
                  <li key={idx} className="text-bloomberg-text text-sm leading-relaxed flex items-start gap-3">
                    <span className="text-bloomberg-accent mt-1 font-bold">{idx + 1}.</span>
                    <span className="flex-1">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bull Case */}
          {insights.bull_case && (
            <div className="bg-green-900/20 border-2 border-green-500/50 rounded-lg p-6">
              <h4 className="text-base font-bold text-green-400 mb-3 flex items-center gap-2">
                <TrendingUp size={18} />
                Bull Case - Upside Scenarios
              </h4>
              <p className="text-bloomberg-text text-sm leading-relaxed whitespace-pre-line">{insights.bull_case}</p>
            </div>
          )}

          {/* Bear Case */}
          {insights.bear_case && (
            <div className="bg-red-900/20 border-2 border-red-500/50 rounded-lg p-6">
              <h4 className="text-base font-bold text-red-400 mb-3 flex items-center gap-2">
                <TrendingDown size={18} />
                Bear Case - Downside Risks
              </h4>
              <p className="text-bloomberg-text text-sm leading-relaxed whitespace-pre-line">{insights.bear_case}</p>
            </div>
          )}

          {/* Risk Factors */}
          {insights.risk_factors?.length > 0 && (
            <div className="bg-bloomberg-panel p-5 rounded-lg border border-bloomberg-border">
              <h4 className="text-base font-bold text-bloomberg-text mb-4 flex items-center gap-2">
                <AlertCircle size={18} className="text-red-400" />
                Key Risk Factors
              </h4>
              <ul className="space-y-3">
                {insights.risk_factors.map((risk, idx) => (
                  <li key={idx} className="text-bloomberg-text text-sm leading-relaxed flex items-start gap-3">
                    <span className="text-red-400 mt-1 font-bold">{idx + 1}.</span>
                    <span className="flex-1">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metrics to Watch */}
          {insights.metrics_to_watch?.length > 0 && (
            <div className="bg-bloomberg-panel p-5 rounded-lg border border-bloomberg-border">
              <h4 className="text-base font-bold text-bloomberg-text mb-4 flex items-center gap-2">
                <Target size={18} />
                Key Metrics to Monitor
              </h4>
              <ul className="space-y-3">
                {insights.metrics_to_watch.map((metric, idx) => (
                  <li key={idx} className="text-bloomberg-text text-sm leading-relaxed flex items-start gap-3">
                    <span className="text-bloomberg-accent mt-1 font-bold">{idx + 1}.</span>
                    <span className="flex-1">{metric}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Time Horizon & Risk Profile */}
          <div className="grid grid-cols-2 gap-4">
            {insights.time_horizon && insights.time_horizon !== "N/A" && (
              <div className="bg-bloomberg-panel p-3 rounded-lg border border-bloomberg-border">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-bloomberg-text-muted" />
                  <span className="text-xs text-bloomberg-text-muted uppercase tracking-wide">Time Horizon</span>
                </div>
                <p className="text-bloomberg-text text-sm font-medium">{insights.time_horizon}</p>
              </div>
            )}
            {insights.risk_profile && insights.risk_profile !== "N/A" && (
              <div className="bg-bloomberg-panel p-3 rounded-lg border border-bloomberg-border">
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={14} className="text-bloomberg-text-muted" />
                  <span className="text-xs text-bloomberg-text-muted uppercase tracking-wide">Risk Profile</span>
                </div>
                <p className="text-bloomberg-text text-sm font-medium">{insights.risk_profile}</p>
              </div>
            )}
          </div>

          {/* Data Warnings */}
          {insights.data_warnings?.length > 0 && insights.data_warnings[0]?.toLowerCase() !== "none" && (
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Data Warnings</span>
              </div>
              <ul className="space-y-1">
                {insights.data_warnings.map((warning, idx) => (
                  <li key={idx} className="text-yellow-300 text-xs">{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!insights && !loading && (
        <div className="text-center py-8 text-bloomberg-text-muted">
          <Sparkles size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Click "Generate Analysis" to get AI-powered insights</p>
        </div>
      )}
    </div>
  );
}
