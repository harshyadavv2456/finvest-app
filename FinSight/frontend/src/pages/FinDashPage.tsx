/**
 * FinDash Module - Markets & Charts
 * Part of FinVest - Unified Financial OS
 *
 * Uses deployed FinDash from findash.fintaxlife.com
 */

import { useState } from 'react';
import { BarChart3, RefreshCw, Maximize2 } from 'lucide-react';
import { FINDASH_URL } from '../config/env';

export default function FinDashPage() {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-white">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50 bg-[#0d1117]">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-green-400" />
          <h1 className="text-lg font-semibold text-white">FinDash Markets</h1>
          <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">Live</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={FINDASH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Full Screen
          </a>
          <button
            onClick={() => {
              setIframeLoaded(false);
              const iframe = document.getElementById('findash-iframe') as HTMLIFrameElement;
              if (iframe) {
                iframe.src = iframe.src;
              }
            }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-300 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-grow relative">
        {/* Loading state */}
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f] z-10">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full animate-spin border-3 border-solid border-green-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-400">Loading FinDash Markets...</p>
              <p className="text-gray-500 text-xs mt-1">Connecting to findash.fintaxlife.com</p>
            </div>
          </div>
        )}

        {/* Iframe - the actual FinDash */}
        <iframe
          id="findash-iframe"
          src={FINDASH_URL}
          title="FinDash Markets"
          className={`w-full h-full border-0 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIframeLoaded(true)}
          style={{ minHeight: 'calc(100vh - 60px)' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        />
      </div>
    </div>
  );
}
