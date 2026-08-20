import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, LogOut, Settings, CreditCard, Bell, 
  ChevronDown, Bookmark, HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface UserMenuProps {
  collapsed?: boolean;
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const navigate = useNavigate();
  const { profile, isAuthenticated, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    setIsOpen(false);
    signOut(); // This will clear state and redirect
  };

  // Get initials from name or email
  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (profile?.email) {
      return profile.email[0].toUpperCase();
    }
    return 'U';
  };

  // Get avatar URL
  const avatarUrl = profile?.avatar_url;

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => navigate('/login')}
        className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-bloomberg-accent to-cyan-500 text-white font-medium rounded-lg hover:opacity-90 transition-all ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <User className="w-4 h-4" />
        {!collapsed && <span>Sign In</span>}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-bloomberg-border transition-all ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover border-2 border-bloomberg-accent"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-bloomberg-accent to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
            {getInitials()}
          </div>
        )}

        {!collapsed && (
          <>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-white truncate max-w-[120px]">
                {profile?.full_name || profile?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-bloomberg-text-muted truncate max-w-[120px]">
                {profile?.email || 'public@finvest.local'}
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-bloomberg-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute ${collapsed ? 'left-full ml-2' : 'right-0'} bottom-full mb-2 w-56 bg-[#161b22] border border-[#30363d] rounded-xl shadow-xl overflow-hidden z-50`}>
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-[#30363d]">
            <p className="text-sm font-medium text-white truncate">
              {profile?.full_name || 'FinVest User'}
            </p>
            <p className="text-xs text-bloomberg-text-muted truncate">
              {profile?.email || 'public@finvest.local'}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button
              onClick={() => { navigate('/portfolio'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              <Bookmark className="w-4 h-4" />
              My Watchlists
            </button>
            <button
              onClick={() => { navigate('/alerts'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              <Bell className="w-4 h-4" />
              Alerts
            </button>
            <button
              onClick={() => { navigate('/settings'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={() => { navigate('/billing'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Billing
              <span className="ml-auto bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">Free</span>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-[#30363d]" />

          {/* Help & Sign Out */}
          <div className="py-2">
            <a
              href="https://t.me/finguru_alerts_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Help & Support
            </a>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

