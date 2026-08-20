/**
 * AUTH DISABLED - PUBLIC MODE
 * All users are treated as authenticated with full access.
 * No Supabase, no login, no redirects.
 */

import { createContext, useContext, ReactNode } from 'react';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  last_login?: string;
}

interface AuthContextType {
  user: null;
  session: null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => void;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// PUBLIC MODE: Everyone is "authenticated"
const publicProfile: UserProfile = {
  id: 'public-user',
  email: 'public@finvest.local',
  full_name: 'Public User',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // PUBLIC MODE: Always authenticated, never loading
  const value: AuthContextType = {
    user: null,
    session: null,
    profile: publicProfile,
    loading: false,
    isAuthenticated: true, // Always true in public mode
    signInWithGoogle: async () => {
      console.warn('Auth disabled - running in PUBLIC MODE');
    },
    signInWithEmail: async () => {
      console.warn('Auth disabled - running in PUBLIC MODE');
      return { error: null };
    },
    signUpWithEmail: async () => {
      console.warn('Auth disabled - running in PUBLIC MODE');
      return { error: null };
    },
    signOut: () => {
      console.warn('Auth disabled - running in PUBLIC MODE');
    },
    resetPassword: async () => {
      console.warn('Auth disabled - running in PUBLIC MODE');
      return { error: null };
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
