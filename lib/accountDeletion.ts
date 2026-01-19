import { supabase } from './supabase';

/**
 * Deletes the current user's account.
 *
 * Preferred path: Supabase Edge Function `delete-account` (deletes auth user + profile).
 * Fallback: `delete_own_account` RPC (deletes profile row only) for environments where the function isn't deployed yet.
 */
export async function deleteMyAccount(): Promise<{ ok: boolean; hardDeleted: boolean }> {
  // Try Edge Function first (full deletion)
  try {
    const { data, error } = await supabase.functions.invoke('delete-account');
    if (!error) return { ok: true, hardDeleted: true };
    // If the function exists but fails, fall through to RPC as last resort.
    console.warn('delete-account function error:', error);
    console.warn('delete-account function data:', data);
  } catch (e) {
    // Network / not deployed / functions not enabled
    console.warn('delete-account function invoke threw:', e);
  }

  // Fallback (profile-only deletion)
  const { error: rpcError } = await supabase.rpc('delete_own_account');
  if (rpcError) throw rpcError;
  return { ok: true, hardDeleted: false };
}

