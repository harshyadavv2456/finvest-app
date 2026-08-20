/**
 * SETTINGS PAGE - PUBLIC MODE
 * No Supabase, no profile saving.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [fullName] = useState(profile?.full_name || 'Public User');

  return (
    <div className="min-h-screen bg-bloomberg-dark">
      {/* Header */}
      <div className="bg-bloomberg-darker border-b border-bloomberg-border px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-bloomberg-border rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-bloomberg-text" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-bloomberg-text">Settings</h1>
            <p className="text-bloomberg-text-muted">Account Information</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Public Mode Banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Info className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-yellow-400 font-medium">Public Mode Active</p>
            <p className="text-yellow-400/80 text-sm">Authentication is disabled. Running in read-only mode.</p>
          </div>
        </div>

        <div className="bg-bloomberg-darker rounded-xl border border-bloomberg-border p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-bloomberg-accent" />
            Profile Information
          </h2>
          
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-bloomberg-accent to-cyan-500 flex items-center justify-center text-white text-2xl font-bold">
              {fullName[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{fullName}</p>
              <p className="text-bloomberg-text-muted text-sm">{profile?.email || 'public@finvest.local'}</p>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                disabled
                className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-3 text-bloomberg-text-muted cursor-not-allowed"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={profile?.email || 'public@finvest.local'}
                disabled
                className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-3 text-bloomberg-text-muted cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-bloomberg-text-muted mb-2">
                Mode
              </label>
              <input
                type="text"
                value="PUBLIC (Read-Only)"
                disabled
                className="w-full bg-bloomberg-dark border border-bloomberg-border rounded-lg px-4 py-3 text-yellow-400 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-6 bg-bloomberg-darker rounded-xl border border-bloomberg-border p-6">
          <h2 className="text-lg font-bold text-white mb-4">Navigation</h2>
          
          <div className="space-y-3">
            <button
              onClick={() => navigate('/')}
              className="w-full text-left px-4 py-3 bg-bloomberg-dark rounded-lg text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              Back to Screener →
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full text-left px-4 py-3 bg-bloomberg-dark rounded-lg text-bloomberg-text hover:bg-bloomberg-border transition-colors"
            >
              FinDash Market Data →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

