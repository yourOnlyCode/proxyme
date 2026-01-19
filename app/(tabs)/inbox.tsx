import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { useStatus } from '@/components/StatusProvider';
import { CoachMarks } from '@/components/ui/CoachMarks';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserConnectionsList } from '@/lib/connections';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, FlatList, Image, Modal, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { reviewCityEvents } from '../../lib/reviewFixtures';
import { isReviewUser } from '../../lib/reviewMode';
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

type StoryProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

type StoryUser = {
  profile: StoryProfile;
  statuses: Array<{
    id: string;
    content: string | null;
    type: 'text' | 'image';
    caption?: string;
    created_at: string;
    expires_at: string;
  }>;
  latestCreatedAt: string;
};

export default function InboxScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { activeStatuses, currentProfile, openMyStatusViewer, openStatusViewer, seenStatusIds } = useStatus();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [focused, setFocused] = useState(true);
  const [items, setItems] = useState<InboxItem[]>(() => getUiCache<InboxItem[]>('inbox.items') ?? []);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>(() => getUiCache<UpcomingEvent[]>('inbox.upcoming') ?? []);
  const [loading, setLoading] = useState(items.length === 0); // initial-only loader
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [selectedInterestId, setSelectedInterestId] = useState<string | null>(null);
  const [upcomingVisible, setUpcomingVisible] = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeConnections, setComposeConnections] = useState<Array<{ conversationId: string; partner: { id: string; username: string; full_name: string | null; avatar_url: string | null } }>>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const router = useRouter();

  const composeRef = useRef<View | null>(null);
  const storiesRef = useRef<View | null>(null);
  const myStoryRef = useRef<View | null>(null);
  const upcomingRef = useRef<View | null>(null);

  const composeSheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const composeClosingRef = useRef(false);
  const screenH = Dimensions.get('window').height || 800;
  const composeSheetHeight = Math.min(560, Math.max(420, Math.floor(screenH * 0.72)));

  const cardStyle = {
    backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
    borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
  } as const;

  const titleStyle = { color: isDark ? '#E5E7EB' : undefined } as const;
  const subStyle = { color: isDark ? 'rgba(226,232,240,0.65)' : undefined } as const;

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

  const seenSet = useMemo(() => new Set(seenStatusIds), [seenStatusIds]);

  const fetchStories = async () => {
    if (!user) return;
    setStoriesLoading(true);
    try {
      const connections = await getUserConnectionsList({ targetUserId: user.id });
      const ids = connections.map((c) => c.id).filter(Boolean);
      if (ids.length === 0) {
        setStoryUsers([]);
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: statusRows, error: statusErr } = await supabase
        .from('statuses')
        .select('id, user_id, content, type, caption, created_at, expires_at')
        .in('user_id', ids)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: true });
      if (statusErr) throw statusErr;

      const byUser = new Map<string, StoryUser['statuses']>();
      for (const row of (statusRows as any[]) || []) {
        const uid = row.user_id as string;
        const arr = byUser.get(uid) || [];
        arr.push({
          id: row.id,
          content: row.content,
          type: row.type,
          caption: row.caption,
          created_at: row.created_at,
          expires_at: row.expires_at,
        });
        byUser.set(uid, arr);
      }

      const usersWithStatuses: StoryUser[] = (connections as any[])
        .map((c: any) => {
          const statuses = byUser.get(c.id) || [];
          const latestCreatedAt = statuses.length ? statuses[statuses.length - 1].created_at : '';
          return {
            profile: {
              id: c.id,
              username: c.username,
              full_name: c.full_name,
              avatar_url: c.avatar_url,
              is_verified: c.is_verified,
            },
            statuses,
            latestCreatedAt,
          };
        })
        .filter((u: StoryUser) => u.statuses.length > 0)
        .sort((a: StoryUser, b: StoryUser) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());

      setStoryUsers(usersWithStatuses);
    } catch {
      // keep inbox usable even if stories fail
    } finally {
      setStoriesLoading(false);
    }
  };

  const fetchComposeConnections = async () => {
    if (!user) return;
    setComposeLoading(true);
    try {
      const { data, error } = await supabase
        .from('interests')
        .select(
          `
          id,
          sender_id,
          receiver_id,
          sender:sender_id ( id, username, full_name, avatar_url ),
          receiver:receiver_id ( id, username, full_name, avatar_url )
        `,
        )
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const rows = (data as any[]) || [];
      const mapped = rows
        .map((r) => {
          const partner = r.sender_id === user.id ? r.receiver : r.sender;
          if (!partner?.id) return null;
          return {
            conversationId: r.id as string,
            partner: {
              id: partner.id as string,
              username: partner.username as string,
              full_name: (partner.full_name as string | null) ?? null,
              avatar_url: (partner.avatar_url as string | null) ?? null,
            },
          };
        })
        .filter(Boolean) as Array<{ conversationId: string; partner: { id: string; username: string; full_name: string | null; avatar_url: string | null } }>;

      // Stable sort: full_name > username
      mapped.sort((a, b) => {
        const an = (a.partner.full_name || a.partner.username || '').toLowerCase();
        const bn = (b.partner.full_name || b.partner.username || '').toLowerCase();
        return an.localeCompare(bn);
      });

      setComposeConnections(mapped);
    } catch {
      setComposeConnections([]);
    } finally {
      setComposeLoading(false);
    }
  };

  const messageItems = useMemo(() => items.filter((i) => i.type === 'message' && i.conversation) as InboxItem[], [items]);
  const unreadMessageItems = useMemo(() => {
    const unread = messageItems
      .filter((i) => Number(i.conversation?.unread_count || 0) > 0)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return unread;
  }, [messageItems]);

  const openCompose = () => {
    composeClosingRef.current = false;
    setComposeVisible(true);
    void fetchComposeConnections();
  };

  const closeCompose = () => {
    if (composeClosingRef.current) return;
    composeClosingRef.current = true;
    Animated.timing(composeSheetAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setComposeVisible(false);
      composeClosingRef.current = false;
    });
  };

  useEffect(() => {
    if (composeVisible) {
      composeSheetAnim.setValue(0);
      Animated.timing(composeSheetAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeVisible]);

  // Only show coach marks when this tab is focused (prevents background tabs from popping a tour).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
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
      // App Store Review Mode: show deterministic upcoming events so reviewers see content immediately.
      if (isReviewUser(user)) {
        const upcoming = [...reviewCityEvents].slice(0, 2).map((e: any, idx) => ({
          id: e.id,
          club_id: e.club_id,
          title: e.title,
          event_date: e.event_date,
          location: e.location,
          club: e.club,
          kind: idx === 0 ? 'hosting' : 'rsvp',
          rsvp_status: idx === 0 ? 'going' : 'maybe',
        }));
        setUpcomingEvents(upcoming as any);
        setUiCache('inbox.upcoming', upcoming as any);
      }

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
          // Only show unread notifications in Circle (tapping should clear it)
          .or('read.is.null,read.eq.false')
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

      // Best-effort refresh for story carousel; never block inbox rendering
      void fetchStories();
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
        <View className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100" style={cardStyle}>
          <TouchableOpacity 
            className="flex-row items-center flex-1"
            onPress={() => openProfile(item.request!.sender.id, item.id)}
          >
            <View className="relative">
              <Avatar path={item.request.sender.avatar_url} />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="font-bold text-lg mb-1" style={titleStyle}>{item.request.sender.username}</Text>
              <Text className="text-gray-500 text-xs mb-1" style={subStyle}>Sent interest</Text>
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
          style={cardStyle}
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
            <Text className="font-bold text-lg mb-1" style={titleStyle}>{item.conversation.partner.username}</Text>
            <Text className="text-gray-500 text-sm" numberOfLines={1} style={subStyle}>
              {preview}
            </Text>
          </View>
          <View className="items-end">
            <View className="bg-gray-100 border border-gray-200 rounded-full w-8 h-8 items-center justify-center mb-2">
              <IconSymbol name="bubble.left.and.bubble.right" size={16} color="#64748B" />
            </View>
            <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
          </View>
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

        // Helper: resolve accepted conversation id for a given partner user id
        const resolveConversationIdForPartner = async (partnerId: string): Promise<string | null> => {
          // 1) If we already have the conversation list in state, use it (fast, offline-friendly).
          for (const it of items) {
            if (it.type === 'message' && it.conversation?.partner?.id === partnerId) {
              return it.conversation.id;
            }
          }

          // 2) Ask the optimized inbox RPC and match partner_id.
          try {
            const { data } = await supabase.rpc('get_my_inbox_conversations');
            const rows = (data as any[]) || [];
            const match = rows.find((r) => String(r.partner_id) === String(partnerId));
            if (match?.id) return String(match.id);
          } catch {
            // ignore and fall back
          }

          // 3) Direct fallback: query interests for accepted row between us and partner.
          if (!user?.id) return null;
          const { data: interest } = await supabase
            .from('interests')
            .select('id')
            .eq('status', 'accepted')
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`,
            )
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return interest?.id ? String((interest as any).id) : null;
        };

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
          const topic = notif.data?.topic_id ? `&topic=${notif.data.topic_id}` : '';
          router.push(`/clubs/${notif.data.club_id}?tab=forum${topic}`);
        } else if (notif.type === 'club_event' && notif.data?.club_id) {
          // Prefer event detail route when we have an event id.
          if (notif.data?.event_id) {
            router.push(`/events/${notif.data.event_id}`);
          } else {
            router.push(`/clubs/${notif.data.club_id}?tab=events`);
          }
        } else if (notif.type === 'club_member' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=members`);
        } else if (notif.type === 'club_invite' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}`);
        } else if (notif.type === 'club_join_request' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=members`);
        } else if (notif.type === 'club_join_accepted' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=forum`);
        } else if (notif.type === 'connection_request') {
          // If the notification includes a user id, open that user profile (actions can be taken from the modal).
          const requesterId = notif.data?.requester_id ?? notif.data?.partner_id ?? null;
          if (requesterId) {
            await openProfile(String(requesterId));
          } else {
            router.push('/requests');
          }
        } else if (notif.type === 'connection_accepted' && notif.data?.partner_id) {
          const convoId =
            (notif.data?.conversation_id ? String(notif.data.conversation_id) : null) ??
            (await resolveConversationIdForPartner(notif.data.partner_id));
          if (convoId) {
            router.push(`/chat/${convoId}`);
          } else {
            Alert.alert('Chat unavailable', 'We couldn’t open this chat yet. Please try again in a moment.');
          }
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
          style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}
        >
          your circle
        </Text>
        <View ref={composeRef} collapsable={false}>
          <TouchableOpacity
            onPress={() => {
              openCompose();
            }}
            activeOpacity={0.85}
          >
            <BlurView
              intensity={18}
              tint="light"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.70)',
                backgroundColor: 'rgba(255,255,255,0.30)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconSymbol name="square.and.pencil" size={18} color="#475569" />
            </BlurView>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stories carousel (Instagram-style) */}
      <View
        ref={storiesRef}
        collapsable={false}
        className="mb-2"
        style={{
          backgroundColor: 'rgba(241,245,249,0.80)',
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: 'rgba(148,163,184,0.12)',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.10,
          shadowRadius: 18,
          elevation: 6,
        }}
      >

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingRight: 22, paddingVertical: 10 }}
        >
          {/* Me (always first) */}
          <View ref={myStoryRef} collapsable={false}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (activeStatuses.length > 0) openMyStatusViewer(0);
                else router.push('/(tabs)/explore');
              }}
              style={{ marginRight: 12, alignItems: 'center', width: 76 }}
            >
              <StoryAvatar path={currentProfile?.avatar_url || null} hasStory={activeStatuses.length > 0} />
              <Text className="text-[11px] text-gray-700 mt-1" numberOfLines={1}>
                You
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider between "You" and everyone else */}
          <View
            style={{
              width: 1,
              height: 54,
              backgroundColor: 'rgba(148,163,184,0.25)',
              marginRight: 14,
              alignSelf: 'center',
            }}
          />

          {/* Connections (unviewed first, then viewed/greyed) */}
          {(storyUsers || [])
            .map((u) => {
              const firstUnviewedIndex = u.statuses.findIndex((s) => !seenSet.has(s.id));
              const hasUnviewed = firstUnviewedIndex !== -1;
              return { ...u, hasUnviewed, firstUnviewedIndex };
            })
            .sort((a, b) => {
              if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
              return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
            })
            .map((u) => {
              const displayName = u.profile.full_name || u.profile.username || 'Connection';
              const startIndex = u.hasUnviewed ? u.firstUnviewedIndex : 0;
              return (
                <TouchableOpacity
                  key={u.profile.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    openStatusViewer({
                      statuses: u.statuses as any,
                      profile: {
                        avatar_url: u.profile.avatar_url,
                        full_name: u.profile.full_name || u.profile.username || 'User',
                        username: u.profile.username || 'user',
                        city: null,
                        is_verified: !!u.profile.is_verified,
                      },
                      startIndex: Math.max(0, startIndex),
                      allowDelete: false,
                    });
                  }}
                  style={{ marginRight: 12, alignItems: 'center', width: 76 }}
                >
                  <StoryAvatar path={u.profile.avatar_url} hasStory={u.hasUnviewed} dimmed={!u.hasUnviewed} />
                  <Text className={`text-[11px] mt-1 ${u.hasUnviewed ? 'text-gray-700' : 'text-gray-400'}`} numberOfLines={1}>
                    {displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}

          {/* Discover placeholder when there are no active stories from connections */}
          {!storiesLoading && (storyUsers || []).length === 0 && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/feed')}
              style={{ marginRight: 12, alignItems: 'center', width: 76 }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  borderWidth: 2,
                  borderColor: 'rgba(148,163,184,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconSymbol name="plus" size={22} color="#64748B" />
              </View>
              <Text className="text-[11px] text-gray-700 mt-1" numberOfLines={1}>
                Discover
              </Text>
            </TouchableOpacity>
          )}

          {storiesLoading && (
            <View style={{ width: 76, alignItems: 'center', justifyContent: 'center' }}>
              <View className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200" />
              <Text className="text-[11px] text-gray-400 mt-2">Loading</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Upcoming Events always at the top */}
      <View ref={upcomingRef} collapsable={false}>
        <TouchableOpacity
          className="mx-4 mb-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center"
          style={cardStyle}
          activeOpacity={0.85}
          onPress={() => setUpcomingVisible(true)}
        >
          <View className="w-9 h-9 rounded-full bg-business/10 items-center justify-center mr-3">
            <IconSymbol name="calendar" size={18} color="#2563EB" />
          </View>
        <View className="flex-1">
          <Text className="text-ink font-bold text-base" style={titleStyle}>Upcoming Events</Text>
          <Text className="text-gray-500 text-xs" numberOfLines={1} style={subStyle}>
            RSVP’d + Interested events
          </Text>
        </View>
        <View className="bg-gray-100 px-3 py-1 rounded-full">
          <Text className="text-gray-700 font-bold text-xs">{String(upcomingEvents.length)}</Text>
        </View>
        </TouchableOpacity>
      </View>

      {/* Messages (directly below Upcoming Events) */}
      <View className="mx-4 mb-3">
        {unreadMessageItems.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/messages')}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center"
            style={cardStyle}
          >
            <View className="flex-1">
              <Text className="text-ink font-bold text-base" style={titleStyle}>Messages</Text>
              <Text className="text-gray-500 text-xs" numberOfLines={1} style={subStyle}>
                No new messages
              </Text>
            </View>
            <View className="bg-gray-100 border border-gray-200 rounded-full w-9 h-9 items-center justify-center">
              <IconSymbol name="bubble.left.and.bubble.right" size={16} color="#64748B" />
            </View>
          </TouchableOpacity>
        ) : unreadMessageItems.length === 1 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/chat/${unreadMessageItems[0]!.conversation!.id}`)}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center"
            style={cardStyle}
          >
            <View className="mr-3">
              <View style={{ shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 4 }}>
                <Avatar path={unreadMessageItems[0]!.conversation!.partner.avatar_url} />
              </View>
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-ink font-bold text-base" numberOfLines={1} style={titleStyle}>
                {unreadMessageItems[0]!.conversation!.partner.username}
              </Text>
              <Text className="text-gray-500 text-xs" numberOfLines={1} style={subStyle}>
                {unreadMessageItems[0]!.conversation!.last_message?.content || 'New message'}
              </Text>
            </View>
            <View className="bg-gray-100 border border-gray-200 rounded-full w-9 h-9 items-center justify-center">
              <IconSymbol name="bubble.left.and.bubble.right" size={16} color="#64748B" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/messages')} style={{ height: 94 }}>
            {[0, 1, 2].map((idx) => {
              const it = unreadMessageItems[idx];
              if (!it?.conversation) return null;
              const isFront = idx === 0;
              const offset = idx * 6;
              const opacity = isFront ? 1 : idx === 1 ? 0.72 : 0.52;
              return (
                <View
                  key={it.id}
                  style={{
                    position: 'absolute',
                    top: offset,
                    left: offset,
                    right: 0,
                    opacity,
                  }}
                  className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-row items-center"
                >
                  <View className="mr-3">
                    <View style={{ shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 }}>
                      <Avatar path={it.conversation.partner.avatar_url} />
                    </View>
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-ink font-bold text-base" numberOfLines={1}>
                      {it.conversation.partner.username}
                    </Text>
                    {isFront ? (
                      <Text className="text-gray-500 text-xs" numberOfLines={1}>
                        {it.conversation.last_message?.content || 'New message'}
                      </Text>
                    ) : (
                      <Text className="text-gray-400 text-xs" numberOfLines={1}>
                        New message
                      </Text>
                    )}
                  </View>
                  {isFront ? (
                    <View className="bg-gray-100 border border-gray-200 rounded-full w-9 h-9 items-center justify-center">
                      <IconSymbol name="bubble.left.and.bubble.right" size={16} color="#64748B" />
                    </View>
                  ) : (
                    <View className="w-9 h-9" />
                  )}
                </View>
              );
            })}
          </TouchableOpacity>
        )}
      </View>

      {/* Glass divider + notifications icon */}
      <View className="mx-4 mb-3 flex-row items-center">
        <View
          style={{
            flex: 1,
            height: 1,
            backgroundColor: 'rgba(148,163,184,0.20)',
          }}
        />
        <View style={{ width: 10 }} />
        <BlurView
          intensity={18}
          tint="light"
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.70)',
            backgroundColor: 'rgba(255,255,255,0.30)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconSymbol name="bell" size={16} color="#64748B" />
        </BlurView>
      </View>



      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 mt-4">Loading inbox...</Text>
        </View>
      ) : (
        <FlatList
          data={items.filter((i) => i.type !== 'message')}
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

      {/* Compose Message Sheet (slides up) */}
      <Modal transparent animationType="none" visible={composeVisible} onRequestClose={closeCompose}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeCompose}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}
          />

          <Animated.View
            style={{
              transform: [
                {
                  translateY: composeSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [composeSheetHeight, 0],
                  }),
                },
              ],
            }}
          >
            <View
              style={{
                height: composeSheetHeight,
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: 'hidden',
                paddingBottom: Platform.OS === 'ios' ? 28 : 16,
              }}
            >
              <View className="items-center pt-3 pb-2">
                <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </View>

              <View className="px-5 pb-4 border-b border-gray-100 flex-row items-center">
                <Text className="text-ink font-bold text-xl flex-1">Messages</Text>
                <TouchableOpacity onPress={closeCompose} className="p-2">
                  <IconSymbol name="xmark" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {composeLoading ? (
                <View className="p-6 items-center">
                  <Text className="text-gray-500">Loading connections…</Text>
                </View>
              ) : (
                <FlatList
                  data={composeConnections}
                  keyExtractor={(c) => c.conversationId}
                  numColumns={3}
                  contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
                  columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 16 }}
                  renderItem={({ item: c }) => (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={{ width: '30%', alignItems: 'center' }}
                      onPress={() => {
                        closeCompose();
                        router.push(`/chat/${c.conversationId}`);
                      }}
                    >
                      <AvatarImage path={c.partner.avatar_url} size={64} />
                      <Text className="text-[11px] text-gray-700 mt-2" numberOfLines={1}>
                        {c.partner.full_name || c.partner.username || 'User'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View className="items-center py-10">
                      <IconSymbol name="person.2" size={36} color="#9CA3AF" />
                      <Text className="text-gray-500 mt-4 font-semibold">No connections yet</Text>
                      <Text className="text-gray-400 mt-1 text-xs text-center">
                        Connect with people to start messaging.
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <CoachMarks
        enabled={focused}
        storageKey="tutorial:tab:circle:v1"
        steps={[
          {
            key: 'stories',
            title: 'Stories',
            body: 'View your connections’ statuses here (unviewed first).',
            targetRef: storiesRef,
          },
          {
            key: 'myStatus',
            title: 'Your status',
            body: 'Tap your profile to view or edit your current status.',
            targetRef: myStoryRef,
          },
          {
            key: 'upcoming',
            title: 'Upcoming events',
            body: 'Your saved events live here so you don’t miss anything.',
            targetRef: upcomingRef,
          },
          {
            key: 'compose',
            title: 'Quick message',
            body: 'Tap this to quickly message a connection from a 3‑column grid.',
            targetRef: composeRef,
          },
        ]}
      />
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

function AvatarImage({ path, size }: { path: string | null; size: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: '#E5E7EB',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.18)',
      }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <View className="w-full h-full items-center justify-center">
          <IconSymbol name="person.fill" size={18} color="#9CA3AF" />
        </View>
      )}
    </View>
  );
}

function StoryAvatar({ path, hasStory, dimmed = false }: { path: string | null; hasStory: boolean; dimmed?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View
      style={{
        width: 68,
        height: 68,
        borderRadius: 34,
        padding: hasStory ? 3 : 0,
        backgroundColor: hasStory ? 'rgba(59,130,246,0.9)' : 'transparent',
        shadowColor: hasStory ? '#3B82F6' : 'transparent',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: hasStory ? 0.25 : 0,
        shadowRadius: 14,
        elevation: hasStory ? 8 : 0,
      }}
    >
      <View
        className="w-full h-full bg-gray-300 rounded-full overflow-hidden"
        style={{
          // Subtle shadow on the avatar itself (carousel polish)
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 7,
        }}
      >
        {url ? (
          <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" style={{ opacity: dimmed ? 0.45 : 1 }} />
        ) : (
          <View className="w-full h-full items-center justify-center bg-gray-200">
            <Text className="text-gray-400 font-bold" style={{ opacity: dimmed ? 0.55 : 1 }}>
              ?
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
