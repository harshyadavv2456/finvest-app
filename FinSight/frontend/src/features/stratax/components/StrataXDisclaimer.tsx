/**
 * StrataX Disclaimer Component
 */

import { AlertTriangle } from 'lucide-react';

export default function StrataXDisclaimer() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mt-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1 text-xs text-bloomberg-text-muted">
          <div className="font-semibold text-yellow-400 mb-2">DISCLAIMER</div>
          <div className="space-y-1">
            <p>
              <strong>Risk Warning:</strong> Options trading involves substantial risk of loss and is not suitable for all investors. 
              Past performance is not indicative of future results.
            </p>
            <p>
              <strong>Educational Purpose:</strong> StrataX is provided for educational and analytical purposes only. 
              It is not intended as financial, investment, or trading advice.
            </p>
            <p>
              <strong>No Guarantees:</strong> All calculations, analyses, and AI-generated insights are estimates based on available data 
              and should not be considered as guarantees of future performance.
            </p>
            <p>
              <strong>Data Accuracy:</strong> While we strive for accuracy, data may be delayed, incomplete, or contain errors. 
              Always verify information from official sources before making trading decisions.
            </p>
            <p>
              <strong>AI Analysis:</strong> AI-generated analysis is based on patterns and historical data and may not account for 
              all market conditions or unexpected events.
            </p>
            <p>
              <strong>Consult Professionals:</strong> Before making any trading decisions, consult with a qualified financial advisor 
              and understand all risks involved.
            </p>
            <p className="mt-2 font-semibold text-yellow-400">
              By using StrataX, you acknowledge that you understand these risks and agree to use this tool at your own discretion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

