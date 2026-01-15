import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { ProfileData } from '@/components/ProfileModal';

export type ConnectionState = 
  | 'not_connected'      // No connection, no interests
  | 'interest_sent'       // User has sent interest, waiting for response
  | 'interest_incoming'   // User has received interest, can accept/decline
  | 'interest_declined'   // They previously declined my interest
  | 'already_connected'; // Users are connected (have connection_id)

export type ConnectionStateData = {
  state: ConnectionState;
  connectionId: string | null;
  interestId: string | null; // ID of the interest record (for canceling or accepting)
  isReceived: boolean; // True if interest was received (for incoming state)
};

export function useConnectionState(profile: ProfileData | null): ConnectionStateData {
  const { user } = useAuth();
  const [stateData, setStateData] = useState<ConnectionStateData>({
    state: 'not_connected',
    connectionId: null,
    interestId: null,
    isReceived: false,
  });

  useEffect(() => {
    if (!profile || !user || profile.id === user.id) {
      setStateData({
        state: 'not_connected',
        connectionId: null,
        interestId: null,
        isReceived: false,
      });
      return;
    }

    const determineState = async () => {
      // First check if already connected
      if (profile.connection_id) {
        setStateData({
          state: 'already_connected',
          connectionId: profile.connection_id,
          interestId: null,
          isReceived: false,
        });
        return;
      }

      // Check for existing interests in both directions
      const [sentInterest, receivedInterest] = await Promise.all([
        // Interest I sent to them
        supabase
          .from('interests')
          .select('id, status')
          .eq('sender_id', user.id)
          .eq('receiver_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        
        // Interest they sent to me
        supabase
          .from('interests')
          .select('id, status')
          .eq('sender_id', profile.id)
          .eq('receiver_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // `maybeSingle()` can still error if there are multiple historical rows.
      // Since we order+limit, that should be rare, but keep this defensive.
      const sent = sentInterest.error ? null : sentInterest.data;
      const received = receivedInterest.error ? null : receivedInterest.data;

      // If both interests exist and are pending, auto-connect them
      if (sent && received && sent.status === 'pending' && received.status === 'pending') {
        // Auto-connect: Accept both interests
        const [acceptSent, acceptReceived] = await Promise.all([
          supabase
            .from('interests')
            .update({ status: 'accepted' })
            .eq('id', sent.id)
            .select('id')
            .single(),
          supabase
            .from('interests')
            .update({ status: 'accepted' })
            .eq('id', received.id)
            .select('id')
            .single(),
        ]);

        if (acceptSent.data && acceptReceived.data) {
          // Create connection record
          const { data: connectionData } = await supabase
            .from('interests')
            .select('id')
            .eq('id', sent.id)
            .single();

          if (connectionData) {
            // Send notification to both users
            await supabase.functions.invoke('push-notification', {
              body: {
                userId: profile.id,
                title: 'You\'ve been connected!',
                body: `You and ${user.id} are now connected.`,
                type: 'connection',
                data: { connectionId: sent.id },
              },
            });

            setStateData({
              state: 'already_connected',
              connectionId: sent.id, // Use interest ID as connection ID
              interestId: null,
              isReceived: false,
            });
            return;
          }
        }
      }

      // Determine state based on interests
      if (received && received.status === 'pending') {
        // Interest incoming - they sent to me
        setStateData({
          state: 'interest_incoming',
          connectionId: null,
          interestId: received.id,
          isReceived: true,
        });
      } else if (sent) {
        if (sent.status === 'pending') {
          // Interest sent - I sent to them
          setStateData({
            state: 'interest_sent',
            connectionId: null,
            interestId: sent.id,
            isReceived: false,
          });
        } else if (sent.status === 'accepted') {
          // Already connected via accepted interest
          setStateData({
            state: 'already_connected',
            connectionId: sent.id,
            interestId: null,
            isReceived: false,
          });
        } else if (sent.status === 'declined') {
          setStateData({
            state: 'interest_declined',
            connectionId: null,
            interestId: sent.id,
            isReceived: false,
          });
        }
      } else {
        // No connection, no interests
        setStateData({
          state: 'not_connected',
          connectionId: null,
          interestId: null,
          isReceived: false,
        });
      }
    };

    determineState();
    // Re-check whenever the profile object changes (proxy/city feeds rehydrate with new objects),
    // so the button can update after a remote accept/decline without requiring navigation.
  }, [profile, user?.id]);

  return stateData;
}

