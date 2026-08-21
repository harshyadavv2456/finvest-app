/**
 * FinVest App Sidebar - Permanent Navigation
 * 
 * RESTORED: Original navigation structure
 * 
 * FinVest is NOT a trading app.
 * Primary entity is RECOMMENDATION MEMORY.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import DataFreshnessBadge from '../DataFreshnessBadge';
import { 
  Home, LineChart, Brain, BarChart3, DollarSign, 
  Zap, Settings, X,
  ChevronLeft, ChevronRight, Lock, PlayCircle, 
  Building2, Users, Layers, Globe, Target,
  Sparkles, GitCompare
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: string;
  disabled?: boolean;
  gradient?: string;
}

// RESTORED: Original navigation items
// Exported so CommandPalette can reuse the same source of truth instead of
// duplicating this list - one place to add a page, not two.
export const NAV_ITEMS: NavItem[] = [
  { 
    id: 'dashboard', 
    label: 'Dashboard', 
    icon: Home, 
    path: '/',
    gradient: 'from-blue-500 to-purple-500'
  },
  { 
    id: 'markets', 
    label: 'Markets', 
    icon: LineChart, 
    path: '/markets',
    badge: 'FinDash',
    gradient: 'from-green-500 to-emerald-500'
  },
  { 
    id: 'simulator', 
    label: 'Simulator', 
    icon: PlayCircle, 
    path: '/simulator',
    badge: 'Memory',
    gradient: 'from-cyan-500 to-blue-500'
  },
  { 
    id: 'positions', 
    label: 'Positions', 
    icon: Target, 
    path: '/positions',
    badge: 'EXIT',
    gradient: 'from-red-500 to-amber-500'
  },
  { 
    id: 'intelligence', 
    label: 'Intelligence', 
    icon: Brain, 
    path: '/intelligence',
    badge: 'FinSight',
    gradient: 'from-purple-500 to-pink-500'
  },
  { 
    id: 'screener', 
    label: 'Screener', 
    icon: BarChart3, 
    path: '/screener',
    gradient: 'from-blue-500 to-cyan-500'
  },
  { 
    id: 'smart-money', 
    label: 'Smart Money', 
    icon: DollarSign, 
    path: '/smart-money',
    gradient: 'from-amber-500 to-orange-500'
  },
  { 
    id: 'market-intel', 
    label: 'Market Intel', 
    icon: Globe, 
    path: '/market-intel',
    gradient: 'from-teal-500 to-cyan-500'
  },
  { 
    id: 'hedge-funds', 
    label: 'Hedge Funds', 
    icon: Building2, 
    path: '/hedge-funds',
    badge: '13F',
    gradient: 'from-violet-500 to-purple-500'
  },
  { 
    id: 'insider-flow', 
    label: 'Insider Flow', 
    icon: Users, 
    path: '/insider-flow',
    gradient: 'from-amber-500 to-yellow-500'
  },
  { 
    id: 'stratax', 
    label: 'StrataX', 
    icon: Layers, 
    path: '/stratax',
    badge: 'Options',
    gradient: 'from-pink-500 to-rose-500'
  },
  { 
    id: 'intrinsiq', 
    label: 'IntrinsIQ', 
    icon: Sparkles, 
    path: '/intrinsiq',
    badge: 'AI Value',
    gradient: 'from-emerald-500 to-cyan-500'
  },
  {
    id: 'alpha-rankings',
    label: 'Alpha Rankings',
    icon: Zap,
    path: '/alpha-rankings',
    badge: 'Alpha',
    gradient: 'from-purple-500 to-pink-500'
  },
  {
    id: 'insights',
    label: 'Signal Reconciliation',
    icon: GitCompare,
    path: '/insights',
    badge: 'New',
    gradient: 'from-amber-500 to-purple-500'
  },
  { 
    id: 'settings', 
    label: 'Settings', 
    icon: Settings, 
    path: '/settings',
    gradient: 'from-gray-500 to-slate-500'
  },
];

export default function AppSidebar({ 
  collapsed, 
  setCollapsed, 
  mobileOpen, 
  setMobileOpen 
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleNavigate = (item: NavItem) => {
    if (item.disabled) return;
    navigate(item.path);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className={`h-full flex flex-col bg-gradient-to-b from-[#0d1117] to-[#0a0a0f] border-r border-gray-800 ${
      collapsed ? 'w-20' : 'w-64'
    } transition-all duration-300`}>
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-gray-800 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {collapsed ? (
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
        ) : (
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                FinVest
              </span>
              <p className="text-[10px] text-gray-500 -mt-0.5">Financial OS</p>
            </div>
          </button>
        )}
        
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation - RESTORED */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item)}
              disabled={item.disabled}
              title={collapsed ? item.label : undefined}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                ${collapsed ? 'justify-center' : ''}
                ${item.disabled 
                  ? 'opacity-40 cursor-not-allowed' 
                  : active
                    ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg`
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }
              `}
            >
              <div className={`flex items-center justify-center ${collapsed ? '' : 'w-5'}`}>
                {item.disabled ? (
                  <Lock size={18} />
                ) : (
                  <Icon size={18} />
                )}
              </div>
              
              {!collapsed && (
                <>
                  <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      active ? 'bg-white/20' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle - Desktop only */}
      <div className="hidden lg:block p-2 border-t border-gray-800">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
        >
          {collapsed ? (
            <ChevronRight size={18} />
          ) : (
            <>
              <ChevronLeft size={18} />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* Data freshness - trust indicator, backed by /api/system/health */}
      <div className="border-t border-gray-800">
        <DataFreshnessBadge collapsed={collapsed} />
      </div>

      {/* Version footer */}
      {!collapsed && (
        <div className="p-3 border-t border-gray-800">
          <div className="text-center">
            <span className="text-[10px] text-gray-600">FinVest v1.0 • Financial OS</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar - Always visible */}
      <div className="hidden lg:block h-full">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar - Slides in */}
      <div className={`
        lg:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </div>
    </>
  );
}

