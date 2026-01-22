import type { User } from '@supabase/supabase-js';

function parseCsv(v: string | undefined | null): string[] {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Comma-separated list of reviewer/test account emails.
// Example:
// EXPO_PUBLIC_REVIEW_EMAILS=review@proxyme.app,apple-review@proxyme.app
export const REVIEW_EMAILS = parseCsv(process.env.EXPO_PUBLIC_REVIEW_EMAILS);

export function isReviewUser(user: User | null | undefined): boolean {
  const email = String(user?.email || '').toLowerCase();
  if (!email) return false;
  // Safe default so `review@proxyme.app` always enables reviewer fixtures in builds
  // even if env config isn't set for some reason.
  if (REVIEW_EMAILS.length === 0) return email === 'review@proxyme.app';
  return REVIEW_EMAILS.includes(email);
}

