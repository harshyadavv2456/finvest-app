import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Brain, 
  Plane, 
  LineChart,
  TrendingUp,
  BarChart3,
  Shield
} from 'lucide-react'
import AuthorityBanner from './AuthorityBanner'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/intelligence', label: 'Intelligence', icon: Brain },
  { path: '/markets', label: 'Markets', icon: BarChart3 },
  { path: '/pilot', label: 'Pilot', icon: Plane, disabled: true },
  { path: '/finsight', label: 'FinSight', icon: LineChart },
  { path: '/findash', label: 'FinDash', icon: TrendingUp },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Authority Banner - Always visible */}
      <AuthorityBanner />
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                  FinVest
                </span>
                <span className="text-xs text-gray-500 block -mt-1">Financial OS</span>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path || 
                  (item.path !== '/' && location.pathname.startsWith(item.path))
                const Icon = item.icon
                
                return (
                  <Link
                    key={item.path}
                    to={item.disabled ? '#' : item.path}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? 'bg-green-500/20 text-green-400' 
                        : item.disabled
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      }
                    `}
                    onClick={item.disabled ? (e) => e.preventDefault() : undefined}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.disabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                        Soon
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          <p>
            FinVest Financial Operating System • 
            <span className="text-green-500 ml-1">Authority: LOCKED</span>
          </p>
          <p className="text-xs mt-1 text-gray-600">
            FinSight decisions are authoritative. No execution. No override.
          </p>
        </div>
      </footer>
    </div>
  )
}

