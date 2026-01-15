import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Modal, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { getUiCache, loadUiCache, setUiCache } from '../../lib/uiCache';

type Interest = {
  id: string;
  sender: {
    id: string;
    username: string;
    avatar_url: string | null;
    detailed_interests: Record<string, string[]> | null;
  };
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

type Conversation = {
  id: string;
  partner: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count?: number;
  created_at?: string; // connection created_at fallback for sorting when no messages exist
};

type Notification = {
  id: string;
  type:
    | 'forum_reply'
    | 'club_event'
    | 'club_member'
    | 'club_invite'
    | 'club_join_request'
    | 'club_join_accepted'
    | 'connection_request'
    | 'connection_accepted'
    | 'message'
    | 'event_rsvp'
    | 'event_rsvp_update'
    | 'event_update'
    | 'event_organizer_update'
    | 'event_comment'
    | 'event_reminder'
    | 'event_cancelled';
  title: string;
  body: string;
  data: {
    club_id?: string;
    topic_id?: string;
    event_id?: string;
    member_id?: string;
    inviter_id?: string;
    partner_id?: string;
    icebreaker?: string;
    requester_id?: string;
  } | null;
  read: boolean;
  created_at: string;
};

type InboxItem = {
  type: 'request' | 'message' | 'notification';
  id: string;
  request?: Interest;
  conversation?: Conversation;
  notification?: Notification;
  timestamp: string;
};

type UpcomingEvent = {
  id: string;
  club_id: string;
  title: string;
  event_date: string;
  location: string | null;
  club?: { id: string; name: string; image_url: string | null } | null;
  kind: 'rsvp' | 'interested' | 'hosting';
  rsvp_status?: 'going' | 'maybe' | 'cant' | null;
};

export default function InboxScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InboxItem[]>(() => getUiCache<InboxItem[]>('inbox.items') ?? []);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>(() => getUiCache<UpcomingEvent[]>('inbox.upcoming') ?? []);
  const [loading, setLoading] = useState(items.length === 0); // initial-only loader
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [selectedInterestId, setSelectedInterestId] = useState<string | null>(null);
  const [upcomingVisible, setUpcomingVisible] = useState(false);
  const router = useRouter();

  // Avoid stale closures inside subscriptions/focus effects.
  const hasItemsRef = useRef(items.length > 0);
  useEffect(() => {
    hasItemsRef.current = items.length > 0;
  }, [items.length]);

  // If we mounted with empty memory-cache (e.g., app cold start), try fast local storage hydrate
  // so we still don't show a blank screen.
  useEffect(() => {
    if (items.length === 0) {
      loadUiCache<InboxItem[]>('inbox.items').then((cached) => {
        if (cached && cached.length > 0) {
          setItems(cached);
          setLoading(false);
        }
      });
    }
    if (upcomingEvents.length === 0) {
      loadUiCache<UpcomingEvent[]>('inbox.upcoming').then((cached) => {
        if (cached && cached.length > 0) {
          setUpcomingEvents(cached);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();

      // Subscribe to message and notification changes
      const subscription = supabase
        .channel('inbox-updates')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        }, () => {
          fetchData({ silent: true });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`
        }, () => {
          fetchData({ silent: true });
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchData({ silent: true });
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [user]);

  // Refresh when screen comes into focus (e.g., returning from chat)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchData({ silent: true });
      }
    }, [user])
  );

  const fetchData = async (opts?: { silent?: boolean }) => {
    if (!user) return;
    const silent = !!opts?.silent;
    if (silent) {
      // keep the list visible; just refresh in background
    } else if (hasItemsRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Fetch pending requests + optimized conversations + notifications in parallel
      const [requestsResult, conversationsResult, notificationsResult, rsvpsResult, interestsResult] = await Promise.all([
        supabase
          .from('interests')
          .select(`
            id,
            status,
            created_at,
            sender:sender_id (id, username, avatar_url, detailed_interests)
          `)
          .eq('receiver_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_inbox_conversations'),
        supabase
          .from('notifications')
          .select('id, type, title, body, data, read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50), // Limit to recent 50 notifications
        supabase
          .from('club_event_rsvps')
          .select('event_id, status')
          .eq('user_id', user.id),
        // Backwards compatible if the table isn't deployed yet
        supabase
          .from('event_interests')
          .select('event_id, status')
          .eq('user_id', user.id)
          .eq('status', 'interested'),
      ]);

      let requestsData = requestsResult.data as any[] | null;
      const conversationsRows = (conversationsResult as any).data as any[] | null;
      const notificationsData = notificationsResult.data;

      // Upcoming events: union of RSVP'd + Interested events (future only)
      try {
        const rsvps = ((rsvpsResult as any)?.data || []) as Array<{ event_id: string; status: 'going' | 'maybe' | 'cant' }>;
        const interestsErr = (interestsResult as any)?.error;
        const interests =
          interestsErr && interestsErr.code === '42P01'
            ? []
            : (((interestsResult as any)?.data || []) as Array<{ event_id: string; status: 'interested' }>);

        const nowIso = new Date().toISOString();

        // Host-created future events should always appear here too (even if RSVP row is missing).
        const { data: hostingEvents } = await supabase
          .from('club_events')
          .select('id, club_id, title, event_date, location, club:clubs(id, name, image_url), is_cancelled')
          .eq('created_by', user.id)
          .eq('is_cancelled', false as any)
          .gt('event_date', nowIso)
          .order('event_date', { ascending: true });

        const ids = Array.from(
          new Set<string>(
            [
              ...rsvps.map((r) => r.event_id),
              ...interests.map((i) => i.event_id),
              ...(((hostingEvents as any[]) || []).map((e: any) => e.id) as string[]),
            ].filter(Boolean),
          ),
        );

        if (ids.length === 0) {
          setUpcomingEvents([]);
        } else {
          const { data: eventsData } = await supabase
            .from('club_events')
            .select('id, club_id, title, event_date, location, created_by, club:clubs(id, name, image_url), is_cancelled')
            .in('id', ids)
            .eq('is_cancelled', false as any)
            .gt('event_date', nowIso)
            .order('event_date', { ascending: true });

          const rsvpMap = new Map(rsvps.map((r) => [r.event_id, r.status]));
          const interestedSet = new Set(interests.map((i) => i.event_id));
          const hostingSet = new Set((((hostingEvents as any[]) || []).map((e: any) => e.id) as string[]));

          // Treat hosting events as "going" for display purposes if RSVP row hasn't been created yet.
          for (const hid of hostingSet) {
            if (!rsvpMap.has(hid)) rsvpMap.set(hid, 'going');
          }

          const upcoming: UpcomingEvent[] = ((eventsData as any[]) || [])
            .map((e: any) => {
              const isHosting = e.created_by === user.id || hostingSet.has(e.id);
              const hasRsvp = rsvpMap.has(e.id);
              const isInterested = interestedSet.has(e.id);
              const kind: UpcomingEvent['kind'] = isHosting ? 'hosting' : hasRsvp ? 'rsvp' : 'interested';
              return {
                id: e.id,
                club_id: e.club_id,
                title: e.title,
                event_date: e.event_date,
                location: e.location,
                club: e.club || null,
                kind,
                rsvp_status: rsvpMap.get(e.id) || null,
              };
            })
            // If event_interests table isn't installed, keep RSVP + Hosting only.
            .filter((e) => e.kind !== 'interested' || interestedSet.size > 0);

          // Order: Hosting first, then RSVP'd, then Interested
          const kindRank: Record<UpcomingEvent['kind'], number> = { hosting: 0, rsvp: 1, interested: 2 };
          upcoming.sort((a, b) => {
            if (a.kind !== b.kind) return kindRank[a.kind] - kindRank[b.kind];
            return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
          });

          setUpcomingEvents(upcoming);
          setUiCache('inbox.upcoming', upcoming);

          // Best-effort backfill RSVP rows for hosted events (covers DBs that haven't applied the trigger yet).
          const missingHosted = upcoming
            .filter((e) => e.kind === 'hosting')
            .filter((e) => !rsvps.find((r) => r.event_id === e.id))
            .map((e) => e.id);

          if (missingHosted.length > 0) {
            void supabase
              .from('club_event_rsvps')
              .upsert(
                missingHosted.map((eventId) => ({ event_id: eventId, user_id: user.id, status: 'going' })),
                { onConflict: 'event_id,user_id' },
              );
          }
        }
      } catch {
        // Don't block inbox if events fetch fails
      }

      // Defensive cleanup:
      // If two users are already connected (any accepted interest either direction),
      // then a remaining "pending" request is stale and should be removed from the inbox.
      if (requestsData && requestsData.length > 0) {
        const senderIds = requestsData.map((r) => r?.sender?.id).filter(Boolean);
        if (senderIds.length > 0) {
          const { data: accepted, error: acceptedErr } = await supabase
            .from('interests')
            .select('id, sender_id, receiver_id')
            .eq('status', 'accepted')
            .or(
              `and(sender_id.eq.${user.id},receiver_id.in.(${senderIds.join(',')})),and(receiver_id.eq.${user.id},sender_id.in.(${senderIds.join(',')}))`
            );

          if (!acceptedErr && accepted) {
            const connectedPartnerIds = new Set<string>();
            for (const row of accepted) {
              const partnerId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
              if (partnerId) connectedPartnerIds.add(partnerId);
            }

            const staleRequestIds = requestsData
              .filter((r) => connectedPartnerIds.has(r?.sender?.id))
              .map((r) => r.id);

            if (staleRequestIds.length > 0) {
              // Update in DB so it doesn't reappear
              await supabase
                .from('interests')
                .update({ status: 'declined' })
                .in('id', staleRequestIds);

              // Remove from UI
              requestsData = requestsData.filter((r) => !staleRequestIds.includes(r.id));
            }
          }
        }
      }

      const conversations: Conversation[] = (conversationsRows || []).map((row) => ({
        id: row.id,
        created_at: row.connection_created_at,
        partner: {
          id: row.partner_id,
          username: row.partner_username,
          avatar_url: row.partner_avatar_url,
        },
        last_message: row.last_message_created_at
          ? {
              content: row.last_message_content,
              created_at: row.last_message_created_at,
              sender_id: row.last_message_sender_id,
            }
          : null,
        unread_count: row.unread_count || 0,
      }));

      // Combine and sort by timestamp
      const inboxItems: InboxItem[] = [
        ...(requestsData || []).map((req: any) => ({
          type: 'request' as const,
          id: req.id,
          request: req,
          timestamp: req.created_at,
        })),
        ...conversations.map((conv) => ({
          type: 'message' as const,
          id: conv.id,
          conversation: conv,
          timestamp: conv.last_message?.created_at || conv.created_at || conv.partner.id,
        })),
        ...(notificationsData || []).map((notif: any) => ({
          type: 'notification' as const,
          id: notif.id,
          notification: notif,
          timestamp: notif.created_at,
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setItems(inboxItems);
      setUiCache('inbox.items', inboxItems);
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openProfile = async (userId: string, interestId?: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
      .eq('id', userId)
      .single();
    
    if (data) {
      const profileWithContext = {
        ...data,
        has_received_interest: !!interestId,
      };
      setSelectedProfile(profileWithContext as ProfileData);
      if (interestId) setSelectedInterestId(interestId);
      setModalVisible(true);
    } else {
      Alert.alert('Error', 'Could not load profile');
    }
  };

  const handleResponse = async (interestId: string, response: 'accepted' | 'declined') => {
    const { error } = await supabase
      .from('interests')
      .update({ status: response })
      .eq('id', interestId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setItems(prev => prev.filter(i => i.id !== interestId));
      if (response === 'accepted') {
        Alert.alert('Connected!', 'You can now chat with this user.');
      }
      setModalVisible(false);
      fetchData(); // Refresh to show new conversation
    }
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    if (item.type === 'request' && item.request) {
      const interestsSummary = item.request.sender.detailed_interests 
        ? Object.entries(item.request.sender.detailed_interests)
            .slice(0, 3)
            .map(([cat, vals]) => vals && vals.length > 0 ? vals[0] : cat)
            .join(', ')
        : 'No interests listed';

      return (
        <View className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
          <TouchableOpacity 
            className="flex-row items-center flex-1"
            onPress={() => openProfile(item.request!.sender.id, item.id)}
          >
            <View className="relative">
              <Avatar path={item.request.sender.avatar_url} />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="font-bold text-lg mb-1">{item.request.sender.username}</Text>
              <Text className="text-gray-500 text-xs mb-1">Sent interest</Text>
              <Text className="text-xs text-business font-medium" numberOfLines={1}>
                {interestsSummary}
              </Text>
            </View>
          </TouchableOpacity>
          
          <View className="flex-row items-center space-x-2">
            <TouchableOpacity 
              className="bg-gray-100 p-3 rounded-full mr-2"
              onPress={() => openProfile(item.request!.sender.id, item.id)}
            >
              <IconSymbol name="eye.fill" size={20} color="#4A5568" />
            </TouchableOpacity>
    
            <TouchableOpacity 
              className="bg-red-50 p-3 rounded-full mr-2"
              onPress={() => handleResponse(item.id, 'declined')}
            >
              <IconSymbol name="xmark" size={20} color="#E53E3E" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              className="bg-green-50 p-3 rounded-full"
              onPress={() => handleResponse(item.id, 'accepted')}
            >
              <IconSymbol name="checkmark" size={20} color="#38A169" />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (item.type === 'message' && item.conversation) {
      const isMyMessage = item.conversation.last_message?.sender_id === user?.id;
      const preview = item.conversation.last_message 
        ? (isMyMessage ? `You: ${item.conversation.last_message.content}` : item.conversation.last_message.content)
        : '';
      const unreadCount = Number(item.conversation?.unread_count || 0);

      return (
        <TouchableOpacity 
          className="flex-row items-center bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100"
          onPress={() => router.push(`/chat/${item.id}`)}
          onLongPress={() => {
            if (!user?.id) return;
            if (unreadCount > 0) return;

            Alert.alert(
              'Conversation',
              'Mark this conversation as unread?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Mark as unread',
                  onPress: async () => {
                    try {
                      // Mark the latest received message as unread.
                      const { data: lastReceived, error: lastErr } = await supabase
                        .from('messages')
                        .select('id')
                        .eq('conversation_id', item.id)
                        .eq('receiver_id', user.id)
                        .eq('sender_id', item.conversation!.partner.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                      if (lastErr) throw lastErr;
                      if (!lastReceived?.id) return;

                      const { error: updErr } = await supabase
                        .from('messages')
                        .update({ read: false, read_at: null })
                        .eq('id', lastReceived.id);

                      if (updErr) throw updErr;
                      fetchData();
                    } catch (e: any) {
                      Alert.alert('Error', e?.message || 'Could not mark as unread.');
                    }
                  },
                },
              ],
            );
          }}
        >
          <View className="relative">
            <Avatar path={item.conversation.partner.avatar_url} />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5 border-2 border-white">
                <Text className="text-white text-[10px] font-bold">
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            )}
          </View>
          <View className="ml-3 flex-1 pr-2">
            <Text className="font-bold text-lg mb-1">{item.conversation.partner.username}</Text>
            <Text className="text-gray-500 text-sm" numberOfLines={1}>
              {preview}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      );
    }

    if (item.type === 'notification' && item.notification) {
      const notif = item.notification;
      const getNotificationIcon = () => {
        switch (notif.type) {
          case 'forum_reply':
            return { name: 'bubble.left.and.bubble.right.fill' as const, color: '#3B82F6' };
          case 'club_event':
            return { name: 'calendar.badge.plus' as const, color: '#10B981' };
          case 'club_member':
            return { name: 'person.badge.plus' as const, color: '#8B5CF6' };
          case 'club_invite':
            return { name: 'envelope.badge' as const, color: '#F59E0B' };
          case 'club_join_request':
            return { name: 'person.crop.circle.badge.questionmark' as const, color: '#0EA5E9' };
          case 'club_join_accepted':
            return { name: 'checkmark.seal.fill' as const, color: '#10B981' };
          case 'connection_accepted':
            return { name: 'sparkles' as const, color: '#2563EB' };
          case 'event_update':
            return { name: 'calendar.badge.clock' as const, color: '#10B981' };
          case 'event_organizer_update':
            return { name: 'megaphone.fill' as const, color: '#2563EB' };
          case 'event_comment':
            return { name: 'bubble.left.and.bubble.right.fill' as const, color: '#3B82F6' };
          case 'event_rsvp':
          case 'event_rsvp_update':
            return { name: 'calendar.badge.checkmark' as const, color: '#2563EB' };
          case 'event_cancelled':
            return { name: 'calendar.badge.minus' as const, color: '#EF4444' };
          case 'event_reminder':
            return { name: 'bell.badge.fill' as const, color: '#F59E0B' };
          default:
            return { name: 'bell.fill' as const, color: '#6B7280' };
        }
      };

      const icon = getNotificationIcon();

      const markNotificationRead = async () => {
        // Mark as read
        if (!notif.read) {
          await supabase
            .from('notifications')
            .update({ read: true, read_at: new Date().toISOString() })
            .eq('id', notif.id);
        }
      };

      const handleClubInviteResponse = async (response: 'accepted' | 'declined') => {
        if (!user?.id || !notif.data?.club_id) return;

        try {
          await markNotificationRead();

          if (response === 'accepted') {
            const { error } = await supabase
              .from('club_members')
              .update({ status: 'accepted' })
              .eq('club_id', notif.data.club_id)
              .eq('user_id', user.id);
            if (error) throw error;

            router.push(`/clubs/${notif.data.club_id}?tab=forum`);
          } else {
            // Decline = remove membership row (requires DELETE policy, added in SQL)
            const { error } = await supabase
              .from('club_members')
              .delete()
              .eq('club_id', notif.data.club_id)
              .eq('user_id', user.id);
            if (error) throw error;
          }

          fetchData();
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Could not update invite.');
        }
      };

      const handleJoinRequestResponse = async (response: 'accepted' | 'declined') => {
        if (!user?.id || !notif.data?.club_id || !notif.data?.requester_id) return;

        try {
          await markNotificationRead();

          if (response === 'accepted') {
            const { error } = await supabase
              .from('club_members')
              .update({ status: 'accepted' })
              .eq('club_id', notif.data.club_id)
              .eq('user_id', notif.data.requester_id)
              .eq('status', 'pending');
            if (error) throw error;
          } else {
            // Decline = delete pending request row
            const { error } = await supabase
              .from('club_members')
              .delete()
              .eq('club_id', notif.data.club_id)
              .eq('user_id', notif.data.requester_id)
              .eq('status', 'pending');
            if (error) throw error;
          }

          fetchData();
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Could not update request.');
        }
      };

      const handleNotificationPress = async () => {
        await markNotificationRead();

        // Navigate based on notification type
        if (
          (notif.type === 'event_update' ||
            notif.type === 'event_organizer_update' ||
            notif.type === 'event_comment' ||
            notif.type === 'event_rsvp' ||
            notif.type === 'event_rsvp_update' ||
            notif.type === 'event_reminder' ||
            notif.type === 'event_cancelled') &&
          notif.data?.event_id
        ) {
          router.push(`/events/${notif.data.event_id}`);
          fetchData();
          return;
        }

        if (notif.type === 'forum_reply' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=forum`);
        } else if (notif.type === 'club_event' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=events`);
        } else if (notif.type === 'club_member' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=members`);
        } else if (notif.type === 'club_invite' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}`);
        } else if (notif.type === 'club_join_request' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=members`);
        } else if (notif.type === 'club_join_accepted' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=forum`);
        } else if (notif.type === 'connection_accepted' && notif.data?.partner_id) {
          router.push(`/chat/${notif.data.partner_id}`);
        }

        fetchData(); // Refresh to update read status
      };

      return (
        <View
          className={`p-4 rounded-xl mb-3 shadow-sm border ${
            notif.read ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-200'
          }`}
        >
          <TouchableOpacity className="flex-row items-center" onPress={handleNotificationPress} activeOpacity={0.8}>
            <View
              className={`w-10 h-10 rounded-full items-center justify-center ${
                notif.read ? 'bg-gray-100' : 'bg-blue-100'
              }`}
            >
              <IconSymbol name={icon.name} size={20} color={icon.color} />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className={`font-bold text-base mb-1 ${notif.read ? 'text-gray-700' : 'text-gray-900'}`}>
                {notif.title}
              </Text>
              <Text className="text-gray-500 text-sm" numberOfLines={2}>
                {notif.body}
              </Text>
            </View>
            {!notif.read && <View className="w-2 h-2 bg-blue-500 rounded-full" />}
          </TouchableOpacity>

          {notif.type === 'club_invite' && notif.data?.club_id && (
            <View className="flex-row items-center justify-end mt-3">
              <TouchableOpacity
                className="bg-gray-100 px-4 py-2 rounded-full mr-2"
                onPress={() => router.push(`/clubs/${notif.data!.club_id}`)}
              >
                <Text className="text-gray-700 font-bold text-xs">View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-50 px-4 py-2 rounded-full mr-2"
                onPress={() => handleClubInviteResponse('declined')}
              >
                <Text className="text-red-600 font-bold text-xs">Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-green-50 px-4 py-2 rounded-full"
                onPress={() => handleClubInviteResponse('accepted')}
              >
                <Text className="text-green-700 font-bold text-xs">Accept</Text>
              </TouchableOpacity>
            </View>
          )}

          {notif.type === 'club_join_request' && notif.data?.club_id && notif.data?.requester_id && (
            <View className="flex-row items-center justify-end mt-3">
              <TouchableOpacity
                className="bg-gray-100 px-4 py-2 rounded-full mr-2"
                onPress={() => router.push(`/clubs/${notif.data!.club_id}?tab=members`)}
              >
                <Text className="text-gray-700 font-bold text-xs">View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-50 px-4 py-2 rounded-full mr-2"
                onPress={() => handleJoinRequestResponse('declined')}
              >
                <Text className="text-red-600 font-bold text-xs">Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-green-50 px-4 py-2 rounded-full"
                onPress={() => handleJoinRequestResponse('accepted')}
              >
                <Text className="text-green-700 font-bold text-xs">Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <View className="flex-1 bg-transparent">
      <ProfileModal
        visible={modalVisible}
        profile={selectedProfile}
        onClose={() => setModalVisible(false)}
        onStateChange={() => {
            // Refresh inbox
            fetchData();
        }}
      />
      
      <View
        className="flex-row justify-between items-center mb-4 px-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="w-10" />
        <Text
          className="text-xl text-ink"
          style={{ fontFamily: 'LibertinusSans-Regular' }}
        >
          Inbox
        </Text>
        <View className="w-10" />
      </View>

      {/* Upcoming Events always at the top */}
      <TouchableOpacity
        className="mx-4 mb-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center"
        activeOpacity={0.85}
        onPress={() => setUpcomingVisible(true)}
      >
        <View className="w-9 h-9 rounded-full bg-business/10 items-center justify-center mr-3">
          <IconSymbol name="calendar" size={18} color="#2563EB" />
        </View>
        <View className="flex-1">
          <Text className="text-ink font-bold text-base">Upcoming Events</Text>
          <Text className="text-gray-500 text-xs" numberOfLines={1}>
            RSVP’d + Interested events
          </Text>
        </View>
        <View className="bg-gray-100 px-3 py-1 rounded-full">
          <Text className="text-gray-700 font-bold text-xs">{String(upcomingEvents.length)}</Text>
        </View>
      </TouchableOpacity>

      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 mt-4">Loading inbox...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData()} />}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View className="items-center mt-10">
              <IconSymbol name="tray" size={48} color="#CBD5E0" />
              <Text className="text-gray-400 text-lg mt-4">Your inbox is empty.</Text>
            </View>
          }
        />
      )}

      <Modal transparent animationType="fade" visible={upcomingVisible} onRequestClose={() => setUpcomingVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          className="flex-1 bg-black/50 items-center justify-center px-4"
          onPress={() => setUpcomingVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} className="w-full max-w-[420px] bg-white rounded-3xl overflow-hidden max-h-[84%]">
            <View className="p-5 border-b border-gray-100 flex-row items-center">
              <Text className="text-ink font-bold text-xl flex-1">Upcoming Events</Text>
              <TouchableOpacity onPress={() => setUpcomingVisible(false)} className="p-2">
                <IconSymbol name="xmark" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5">
              {upcomingEvents.length === 0 ? (
                <View className="items-center py-8">
                  <IconSymbol name="calendar.badge.exclamationmark" size={32} color="#9CA3AF" />
                  <Text className="text-gray-500 mt-3 font-semibold">No upcoming events yet.</Text>
                  <Text className="text-gray-400 mt-1 text-xs text-center">
                    Tap “Interested” on events in the City tab to save them here.
                  </Text>
                </View>
              ) : (
                <View>
                  {upcomingEvents.map((ev) => (
                    <TouchableOpacity
                      key={ev.id}
                      className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-3"
                      activeOpacity={0.85}
                      onPress={() => {
                        setUpcomingVisible(false);
                        router.push(`/events/${ev.id}`);
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-ink font-bold flex-1 pr-2" numberOfLines={1}>
                          {ev.title}
                        </Text>
                          <View
                            className={`px-2 py-1 rounded-full ${
                              ev.kind === 'hosting' ? 'bg-purple-100' : ev.kind === 'rsvp' ? 'bg-green-100' : 'bg-blue-100'
                            }`}
                          >
                          <Text
                            className={`text-xs font-bold ${
                              ev.kind === 'hosting' ? 'text-purple-700' : ev.kind === 'rsvp' ? 'text-green-700' : 'text-blue-700'
                            }`}
                          >
                            {ev.kind === 'hosting' ? 'HOSTING' : ev.kind === 'rsvp' ? 'RSVP’D' : 'INTERESTED'}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-gray-500 mt-1 text-xs">
                        {new Date(ev.event_date).toLocaleString()}
                      </Text>
                      {ev.location ? <Text className="text-gray-400 mt-1 text-xs">📍 {ev.location}</Text> : null}
                      {ev.club?.name ? <Text className="text-gray-400 mt-1 text-xs">From {ev.club.name}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Avatar({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View className="w-12 h-12 bg-gray-300 rounded-full overflow-hidden">
      {url ? (
        <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="w-full h-full items-center justify-center bg-gray-200">
          <Text className="text-gray-400 font-bold">?</Text>
        </View>
      )}
    </View>
  );
}
