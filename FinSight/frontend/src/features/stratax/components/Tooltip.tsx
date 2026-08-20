/**
 * Enhanced Tooltip Component with better visibility and positioning
 */

import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: string;
}

export default function Tooltip({ content, children, position = 'top', maxWidth = 'max-w-md' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = triggerRect.top + scrollY - tooltipRect.height - 8;
          left = triggerRect.left + scrollX + (triggerRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'bottom':
          top = triggerRect.bottom + scrollY + 8;
          left = triggerRect.left + scrollX + (triggerRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = triggerRect.top + scrollY + (triggerRect.height / 2) - (tooltipRect.height / 2);
          left = triggerRect.left + scrollX - tooltipRect.width - 8;
          break;
        case 'right':
          top = triggerRect.top + scrollY + (triggerRect.height / 2) - (tooltipRect.height / 2);
          left = triggerRect.right + scrollX + 8;
          break;
      }

      // Ensure tooltip stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 10) left = 10;
      if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
      }
      if (top < 10) top = 10;
      if (top + tooltipRect.height > viewportHeight + scrollY - 10) {
        top = triggerRect.top + scrollY - tooltipRect.height - 8;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

  return (
    <>
      <div 
        ref={triggerRef}
        className="relative inline-block"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] px-4 py-3 bg-bloomberg-panel border border-bloomberg-border rounded-lg shadow-2xl text-sm text-bloomberg-text ${maxWidth} overflow-y-auto max-h-96`}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          <div className="whitespace-pre-wrap break-words">{content}</div>
          <div className={`absolute ${
            position === 'top' ? 'top-full left-1/2 transform -translate-x-1/2 -mt-1' :
            position === 'bottom' ? 'bottom-full left-1/2 transform -translate-x-1/2 -mb-1' :
            position === 'left' ? 'left-full top-1/2 transform -translate-y-1/2 -ml-1' :
            'right-full top-1/2 transform -translate-y-1/2 -mr-1'
          }`}>
            <div className={`border-4 border-transparent ${
              position === 'top' ? 'border-t-bloomberg-border' :
              position === 'bottom' ? 'border-b-bloomberg-border' :
              position === 'left' ? 'border-l-bloomberg-border' :
              'border-r-bloomberg-border'
            }`}></div>
          </div>
        </div>
      )}
    </>
  );
}

