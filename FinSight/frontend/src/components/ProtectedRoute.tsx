/**
 * PROTECTED ROUTE DISABLED - PUBLIC MODE
 * All routes are accessible without authentication.
 * No login prompts, no redirects.
 */

import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
}

// PUBLIC MODE: Always render children, no auth checks
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  return <>{children}</>;
}

// PUBLIC MODE: Always render children
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// PUBLIC MODE: Always render children
export function PremiumFeature({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
