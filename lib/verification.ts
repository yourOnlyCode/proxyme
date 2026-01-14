import { supabase } from './supabase';

/**
 * Verification is currently referral-based:
 * - A user shares their `friend_code`
 * - Each friend enters it during onboarding (which increments `referral_count`)
 * - When `referral_count >= REQUIRED_REFERRALS_FOR_VERIFICATION`, the user is considered verified
 */
export const REQUIRED_REFERRALS_FOR_VERIFICATION = 3;

export async function checkVerificationStatus(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('referral_count, is_verified')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    const referralCount = Number((data as any)?.referral_count || 0);
    const shouldBeVerified = referralCount >= REQUIRED_REFERRALS_FOR_VERIFICATION;

    // Keep `is_verified` in sync with the referral threshold.
    if (data && (data as any).is_verified !== shouldBeVerified) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_verified: shouldBeVerified })
        .eq('id', userId);
      if (updateError) throw updateError;
    }

    return shouldBeVerified;
  } catch (e) {
    console.error('Verification status check error:', e);
    return false;
  }
}

