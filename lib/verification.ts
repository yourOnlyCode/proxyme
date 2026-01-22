import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Verification (safety / trust) is NOT a social badge.
 *
 * New definition:
 * - A user is "verified" if they authenticate via Apple/Google OAuth OR link Apple/Google to an email account.
 * - Verification is used for feature gating and RLS policies (profiles.is_verified).
 *
 * Social status badges are separate:
 * - "Super user" (blue check): earned by sharing the app 3 times (share_count >= 3)
 * - "Trendsetter" (orange check): earned by 3 successful signups using your friend code (referral_count >= 3)
 */
export const REQUIRED_SHARES_FOR_SUPER_USER = 3;
export const REQUIRED_REFERRALS_FOR_TRENDSETTER = 3;

const VERIFICATION_PROVIDERS = new Set(['google', 'apple']);

export function computeIsVerifiedFromAuthUser(user: User | null | undefined): boolean {
  if (!user) return false;

  const providers = new Set<string>();

  const primary = (user.app_metadata as any)?.provider;
  if (typeof primary === 'string' && primary) providers.add(primary);

  const list = (user.app_metadata as any)?.providers;
  if (Array.isArray(list)) {
    for (const p of list) if (typeof p === 'string' && p) providers.add(p);
  }

  const identities = (user as any)?.identities;
  if (Array.isArray(identities)) {
    for (const i of identities) {
      const p = i?.provider;
      if (typeof p === 'string' && p) providers.add(p);
    }
  }

  for (const p of providers) {
    if (VERIFICATION_PROVIDERS.has(String(p).toLowerCase())) return true;
  }

  return false;
}

/**
 * Keep `profiles.is_verified` in sync with the user's linked auth identities.
 * This is important because many RLS policies depend on `profiles.is_verified = true`.
 */
export async function syncVerificationStatusForCurrentUser(): Promise<boolean> {
  try {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const user = auth?.user ?? null;
    if (!user?.id) return false;

    const shouldBeVerified = computeIsVerifiedFromAuthUser(user);

    // Only update when it actually changes (avoid spamming realtime updates).
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('is_verified')
      .eq('id', user.id)
      .maybeSingle();
    if (profErr) throw profErr;

    const current = !!(prof as any)?.is_verified;
    if (current !== shouldBeVerified) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_verified: shouldBeVerified })
        .eq('id', user.id);
      if (updateError) throw updateError;
    }

    return shouldBeVerified;
  } catch (e) {
    console.error('Verification sync error:', e);
    return false;
  }
}

/**
 * Back-compat helper for screens still calling this by user id.
 * Note: verification is based on the current auth user (linked identities), not arbitrary profile ids.
 */
export async function checkVerificationStatus(_userId: string) {
  return syncVerificationStatusForCurrentUser();
}

export function isSuperUserByShareCount(shareCount: number | null | undefined) {
  return Number(shareCount || 0) >= REQUIRED_SHARES_FOR_SUPER_USER;
}

export function isTrendsetterByReferralCount(referralCount: number | null | undefined) {
  return Number(referralCount || 0) >= REQUIRED_REFERRALS_FOR_TRENDSETTER;
}
