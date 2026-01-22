import { supabase } from './supabase';

/**
 * Best-effort share tracking for Super User (blue check).
 * We increment `profiles.share_count` when the user triggers a share action.
 *
 * Note: OS share sheets don't guarantee the user actually sent it to a person.
 * This is "intent to share" tracking.
 */
export async function recordAppShare({ userId }: { userId: string }) {
  try {
    // Read current count (avoid relying on SQL increment funcs that may not exist yet).
    const { data, error } = await supabase
      .from('profiles')
      .select('share_count')
      .eq('id', userId)
      .maybeSingle();

    // If the column doesn't exist on an older DB, don't crash sharing.
    if (error && (error as any)?.code === '42703') return null;
    if (error) throw error;

    const current = Number((data as any)?.share_count ?? 0);
    const next = current + 1;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ share_count: next })
      .eq('id', userId);

    if (updateError && (updateError as any)?.code === '42703') return null;
    if (updateError) throw updateError;

    return next;
  } catch {
    return null;
  }
}

