import { supabase } from '@/lib/supabase';

export type ConnectedUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  relationship_goals: string[] | null;
  bio: string | null;
  is_verified: boolean | null;
};

function looksLikeMissingRpc(error: any) {
  const msg = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return (
    msg.includes('could not find the function') ||
    msg.includes('function') && msg.includes('does not exist') ||
    msg.includes('pgrst') && msg.includes('function')
  );
}

function looksLikeBrokenRpc(error: any) {
  // Example: Postgres 42702 "column reference \"id\" is ambiguous"
  if (error?.code === '42702') return true;
  const msg = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return msg.includes('is ambiguous') || msg.includes('column reference') && msg.includes('ambiguous');
}

/**
 * Fetch a user's accepted connections (partner profiles).
 *
 * Primary path: calls `get_user_connections_list` RPC (SECURITY DEFINER, respects hide_connections).
 * Fallback path: queries `interests` + `profiles` directly (works even if RPC wasn't applied in Supabase).
 */
export async function getUserConnectionsList(params: {
  targetUserId: string;
  filterIntent?: string | null; // 'Romance' | 'Friendship' | 'Professional' | null
}): Promise<ConnectedUser[]> {
  const targetUserId = params.targetUserId;
  const filterIntent = params.filterIntent ?? null;

  // Try the RPC first (fast + privacy-aware).
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_connections_list', {
    target_user_id: targetUserId,
    filter_intent: filterIntent,
  });

  if (!rpcError) return (rpcData as ConnectedUser[]) || [];

  // If RPC exists but failed for other reasons, surface the error.
  if (!looksLikeMissingRpc(rpcError) && !looksLikeBrokenRpc(rpcError)) {
    throw rpcError;
  }

  // Fallback: mimic privacy guard (hide_connections) when viewing someone else.
  const { data: viewer } = await supabase.auth.getUser();
  const viewerId = viewer?.user?.id ?? null;

  if (viewerId && viewerId !== targetUserId) {
    const { data: privacyRow, error: privacyError } = await supabase
      .from('profiles')
      .select('hide_connections')
      .eq('id', targetUserId)
      .maybeSingle();
    if (privacyError) throw privacyError;
    if (privacyRow?.hide_connections) return [];
  }

  // Fetch accepted interests involving target user.
  const { data: interestRows, error: interestsError } = await supabase
    .from('interests')
    .select('sender_id, receiver_id, status')
    .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`)
    .eq('status', 'accepted');
  if (interestsError) throw interestsError;

  const partnerIds = Array.from(
    new Set(
      (interestRows || []).map((r: any) => (r.sender_id === targetUserId ? r.receiver_id : r.sender_id)).filter(Boolean)
    )
  );

  if (partnerIds.length === 0) return [];

  let query = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, relationship_goals, bio, is_verified')
    .in('id', partnerIds);

  if (filterIntent) {
    // relationship_goals is a text[]; contains() -> @> in Postgres
    query = query.contains('relationship_goals', [filterIntent]);
  }

  const { data: profiles, error: profilesError } = await query;
  if (profilesError) throw profilesError;

  return (profiles as ConnectedUser[]) || [];
}

export async function removeConnection(params: { partnerId: string }) {
  const { partnerId } = params;

  // Preferred path: RPC allowing either side to disconnect.
  const { error: rpcError } = await supabase.rpc('remove_connection', { p_partner_id: partnerId });
  if (!rpcError) return;

  // If RPC isn't deployed yet, fallback: try updating as receiver (will work when current user is receiver).
  if (looksLikeMissingRpc(rpcError)) {
    const { data: me } = await supabase.auth.getUser();
    const meId = me?.user?.id;
    if (!meId) throw rpcError;

    const { error: updateError } = await supabase
      .from('interests')
      .update({ status: 'declined' })
      .eq('status', 'accepted')
      .eq('receiver_id', meId)
      .eq('sender_id', partnerId);

    if (updateError) throw updateError;
    return;
  }

  throw rpcError;
}

