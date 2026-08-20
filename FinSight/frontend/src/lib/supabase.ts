/**
 * SUPABASE DISABLED - PUBLIC MODE
 * Auth is out of scope for this phase.
 * All functions return null/no-op.
 */

console.warn('Supabase disabled — running in PUBLIC MODE');

// Supabase client is disabled
export const supabase = null;

// Helper function to get user profile - DISABLED
export const getUserProfile = async (_userId: string) => {
  return null;
};

// Helper function to update user profile - DISABLED
export const updateUserProfile = async (_userId: string, _updates: Record<string, unknown>) => {
  return null;
};

// Track user activity - DISABLED
export const trackActivity = async (_userId: string, _action: string, _metadata?: Record<string, unknown>) => {
  // No-op in public mode
};
