import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'dark' | 'light';
  autosize?: boolean;
  height?: number;
  interval?: string;
}

const TradingViewChart: React.FC<TradingViewChartProps> = memo(({ 
  symbol, 
  theme = 'dark',
  autosize = true,
  height = 400,
  interval = 'D'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Convert symbol to TradingView format
  const getTradingViewSymbol = (sym: string): string => {
    // Indian stocks (NSE)
    if (sym.includes('.NS')) {
      return `NSE:${sym.replace('.NS', '')}`;
    }
    // Indian stocks (BSE)
    if (sym.includes('.BO')) {
      return `BSE:${sym.replace('.BO', '')}`;
    }
    // Australian stocks
    if (sym.includes('.AX')) {
      return `ASX:${sym.replace('.AX', '')}`;
    }
    // Hong Kong stocks
    if (sym.includes('.HK')) {
      return `HKEX:${sym.replace('.HK', '')}`;
    }
    // Japanese stocks
    if (sym.includes('.T')) {
      return `TSE:${sym.replace('.T', '')}`;
    }
    // Chinese stocks (Shanghai)
    if (sym.includes('.SS')) {
      return `SSE:${sym.replace('.SS', '')}`;
    }
    // Chinese stocks (Shenzhen)
    if (sym.includes('.SZ')) {
      return `SZSE:${sym.replace('.SZ', '')}`;
    }
    // UK stocks
    if (sym.includes('.L')) {
      return `LSE:${sym.replace('.L', '')}`;
    }
    // Singapore stocks
    if (sym.includes('.SI')) {
      return `SGX:${sym.replace('.SI', '')}`;
    }
    // Indices
    if (sym.startsWith('^')) {
      const indexMap: Record<string, string> = {
        '^GSPC': 'SP:SPX',
        '^DJI': 'DJ:DJI',
        '^IXIC': 'NASDAQ:IXIC',
        '^NSEI': 'NSE:NIFTY',
        '^BSESN': 'BSE:SENSEX',
      };
      return indexMap[sym] || sym;
    }
    // Default: US stocks (NASDAQ/NYSE)
    return `NASDAQ:${sym}`;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous widget
    containerRef.current.innerHTML = '';
    
    const tvSymbol = getTradingViewSymbol(symbol);
    
    // Create script element for TradingView widget
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: autosize,
      height: height,
      symbol: tvSymbol,
      interval: interval,
      timezone: "Etc/UTC",
      theme: theme,
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      studies: [
        "STD;SMA"
      ],
      show_popup_button: false,
      popup_width: "1000",
      popup_height: "650",
      container_id: `tradingview_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}`
    });

    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.height = `${height}px`;
    container.style.width = '100%';
    
    const widgetContainer = document.createElement('div');
    widgetContainer.id = `tradingview_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}`;
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';
    
    container.appendChild(widgetContainer);
    container.appendChild(script);
    
    containerRef.current.appendChild(container);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, theme, height, autosize, interval]);

  return (
    <div 
      ref={containerRef} 
      className="tradingview-widget-wrapper w-full rounded-lg overflow-hidden"
      style={{ minHeight: `${height}px` }}
    />
  );
});

TradingViewChart.displayName = 'TradingViewChart';

export default TradingViewChart;

