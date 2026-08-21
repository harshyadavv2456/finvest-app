/**
 * FinVest App Layout - Permanent Sidebar
 * The sidebar NEVER unmounts. Content changes on the right only.
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import CommandPalette from './CommandPalette';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Global command palette (Ctrl+K / Cmd+K) - lives here so it's
          available from every route without each page mounting it. */}
      <CommandPalette />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      
      {/* Permanent Sidebar - Never unmounts */}
      <AppSidebar 
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with menu toggle */}
        <div className="lg:hidden flex items-center h-14 px-4 border-b border-gray-800 bg-[#0d1117]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 text-lg font-semibold text-white">FinVest</span>
        </div>
        
        {/* Route content renders here */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

