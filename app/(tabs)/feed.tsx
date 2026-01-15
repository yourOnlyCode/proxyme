import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, PanResponder, RefreshControl, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { calculateMatchPercentage as calculateMatchPercentageShared, getCommonInterests as getCommonInterestsShared } from '../../lib/match';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

type StatusItem = {
    id: string;
    content: string | null;
    type: 'text' | 'image';
    caption?: string;
    created_at: string;
    expires_at: string;
};

// Fast URL resolver + cache (avoids a blank frame on mount and speeds up next/prev taps).
const publicUrlCache = new Map<string, string>();
function resolvePublicAvatarUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleaned = path.includes('public/avatars/') ? path.split('public/avatars/')[1] : path;
    const cached = publicUrlCache.get(cleaned);
    if (cached) return cached;
    const { data } = supabase.storage.from('avatars').getPublicUrl(cleaned);
    const url = data?.publicUrl ?? null;
    if (url) publicUrlCache.set(cleaned, url);
    return url;
}

type FeedProfile = ProfileData & {
  dist_meters: number;
  statuses?: StatusItem[];
};

type PublicEvent = {
  id: string;
  club_id: string;
  created_by?: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  is_public: boolean;
  image_url?: string | null;
  club: {
    id: string;
    name: string;
    image_url: string | null;
    city: string;
    detailed_interests?: Record<string, string[]> | null;
  } | null;
  my_rsvp?: 'going' | 'maybe' | 'cant' | null;
  my_interest?: 'interested' | 'not_interested' | null;
  match_score?: number;
  common_interests?: string[];
};

type FeedItem =
  | { kind: 'profile'; id: string; profile: FeedProfile }
  | { kind: 'event'; id: string; event: PublicEvent };

const CITY_RANGE = 50000; // 50km for "City"

export default function CityFeedScreen() {
  const { width, height: windowHeight } = useWindowDimensions();
  let tabBarHeight = 0;
  try {
      tabBarHeight = useBottomTabBarHeight();
  } catch (e) {
      tabBarHeight = 80; // Fallback
  }

  const [listHeight, setListHeight] = useState(windowHeight - tabBarHeight);
  const { user } = useAuth();
  const { location, address } = useProxyLocation();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true); // Start with true to show loading state
  
  // Modal State
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [myInterests, setMyInterests] = useState<Record<string, string[]> | null>(null);
  const [myGoals, setMyGoals] = useState<string[] | null>(null);
  const [myIsVerified, setMyIsVerified] = useState(false);
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [eventDetailVisible, setEventDetailVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PublicEvent | null>(null);
  const [eventAttendees, setEventAttendees] = useState<Array<{ id: string; username: string; full_name: string | null; avatar_url: string | null; is_verified?: boolean; status: string }> | null>(null);

  const router = useRouter();

  // Track initial touch position for swipe detection
  const initialTouchX = useRef<number | null>(null);

  // Swipe gesture handler (swipe left for inbox)
  const cityFeedPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Store initial touch position
        if (initialTouchX.current === null) {
          initialTouchX.current = evt.nativeEvent.pageX;
        }
        
        // Only respond to horizontal swipes
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasEnoughMovement = Math.abs(gestureState.dx) > 30;
        
        return isHorizontal && hasEnoughMovement;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Swipe left (dx < 0) to open inbox
        if (gestureState.dx < -100) {
          router.push('/inbox');
        }
        
        // Reset initial touch position
        initialTouchX.current = null;
      },
      onPanResponderTerminate: () => {
        // Reset on cancel
        initialTouchX.current = null;
      },
    })
  ).current;

  useEffect(() => {
    if (user) {
        supabase.from('profiles').select('detailed_interests, relationship_goals, is_verified, friend_code').eq('id', user.id).single()
        .then(({ data }) => {
            if (data) {
                setMyInterests(data.detailed_interests);
                setMyGoals(data.relationship_goals);
                setMyIsVerified(!!data.is_verified);
                setMyFriendCode(data.friend_code || null);
            }
        });
    }
  }, [user]);

  const fetchFeed = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!location) {
      setLoading(false);
      setFeed([]);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_city_users', {
        lat: location.coords.latitude,
        long: location.coords.longitude,
        range_meters: CITY_RANGE
      });

      if (error) {
        console.error('Error fetching city feed:', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
          raw: error,
        });
        setFeed([]);
      } else if (data) {
        // 1. Filter: Only show users with active statuses
        let filteredProfiles = data.filter((u: FeedProfile) => u.statuses && u.statuses.length > 0);

        // 2. Sort: Top down based on Interest Match Score
        if (myInterests) {
            filteredProfiles.sort((a: FeedProfile, b: FeedProfile) => {
                const scoreA = calculateRawMatchScore(a.detailed_interests);
                const scoreB = calculateRawMatchScore(b.detailed_interests);
                return scoreB - scoreA; // Descending order
            });
        }

        // 3. Fetch pending requests for each user
        const userIds = filteredProfiles.map((u: FeedProfile) => u.id);
        if (userIds.length > 0 && user) {
            const { data: pendingData } = await supabase
                .from('interests')
                .select('id, sender_id, receiver_id, status')
                .in('sender_id', [user.id, ...userIds])
                .in('receiver_id', [user.id, ...userIds])
                .in('status', ['pending']);
            
            // Create a map of user_id -> pending interest
            const pendingMap = new Map<string, { id: string; isReceived: boolean }>();
            pendingData?.forEach((interest: any) => {
                if (interest.sender_id === user.id) {
                    // User sent request to this person
                    pendingMap.set(interest.receiver_id, { id: interest.id, isReceived: false });
                } else if (interest.receiver_id === user.id) {
                    // User received request from this person
                    pendingMap.set(interest.sender_id, { id: interest.id, isReceived: true });
                }
            });
            
            // Add pending request info to each user
            const enrichedProfiles = filteredProfiles.map((u: FeedProfile) => {
                const pending = pendingMap.get(u.id);
                return {
                    ...u,
                    pending_request: pending ? { id: pending.id, is_received: pending.isReceived } : null
                } as FeedProfile & { pending_request?: { id: string; is_received: boolean } | null };
            });

            // Fetch public events for this city and interleave them into the feed.
            let publicEvents: PublicEvent[] = [];
            if (address?.city) {
              let q = supabase
                .from('club_events')
                .select('id, club_id, created_by, title, description, event_date, location, is_public, image_url, is_cancelled, club:clubs(id, name, image_url, city, detailed_interests)')
                .eq('is_public', true)
                .eq('is_cancelled', false as any)
                .gt('event_date', new Date().toISOString())
                .eq('club.city', address.city)
                .order('event_date', { ascending: true })
                .limit(12);

              // Don't show creators their own public events in City feed.
              if (user?.id) {
                q = (q as any).neq('created_by', user.id);
              }

              const eventsQuery = await q;

              // If DB hasn't been migrated to include `is_public`, just skip event mixing for now.
              if ((eventsQuery as any)?.error?.code === '42703') {
                publicEvents = [];
              } else {
                const raw = (((eventsQuery as any).data || []) as any[]) || [];
                publicEvents = (user?.id ? raw.filter((e) => e?.created_by !== user.id) : raw) as any;
              }

              // Get my RSVP statuses for these events
              if (publicEvents.length > 0) {
                const { data: myRsvps } = await supabase
                  .from('club_event_rsvps')
                  .select('event_id, status')
                  .eq('user_id', user.id)
                  .in('event_id', publicEvents.map((e) => e.id));

                const rsvpMap = new Map<string, any>((myRsvps || []).map((r: any) => [r.event_id, r.status]));

                // Get my Interested / Not Interested state for these events (if the table exists)
                let interestMap = new Map<string, any>();
                try {
                  const { data: myInterestsRows, error: myInterestsErr } = await supabase
                    .from('event_interests')
                    .select('event_id, status')
                    .eq('user_id', user.id)
                    .in('event_id', publicEvents.map((e) => e.id));

                  if (!myInterestsErr && myInterestsRows) {
                    interestMap = new Map<string, any>(myInterestsRows.map((r: any) => [r.event_id, r.status]));
                  }
                } catch {
                  // Backwards compat if table doesn't exist yet.
                }

                publicEvents = publicEvents.map((e) => {
                  const clubInterests = (e as any)?.club?.detailed_interests || null;
                  const score = calculateRawMatchScore(clubInterests);
                  const common = getCommonInterestsFor(clubInterests);
                  return {
                    ...e,
                    my_rsvp: rsvpMap.get(e.id) || null,
                    my_interest: interestMap.get(e.id) || null,
                    match_score: score,
                    common_interests: common,
                  };
                });

                // Never show events the user explicitly acted on (Interested / Not interested)
                // Interested events live in Inbox -> Upcoming Events instead.
                publicEvents = publicEvents.filter((e) => e.my_interest !== 'not_interested' && e.my_interest !== 'interested');
              }
            }

            const items: FeedItem[] = [];
            const ranked = [...publicEvents].sort((a, b) => (Number(b.match_score || 0) - Number(a.match_score || 0)));
            const eventsQueue = ranked.filter((e) => Number(e.match_score || 0) > 0);
            const coldQueue = ranked.filter((e) => Number(e.match_score || 0) === 0);
            enrichedProfiles.forEach((p: FeedProfile, idx: number) => {
              items.push({ kind: 'profile', id: p.id, profile: p });
              // Mix an event every 3 profiles (simple first-pass algorithm)
              if ((idx + 1) % 3 === 0 && eventsQueue.length > 0) {
                const ev = eventsQueue.shift()!;
                items.push({ kind: 'event', id: `event:${ev.id}`, event: ev });
              }
            });
            // Add remaining events at end
            while (eventsQueue.length > 0) {
              const ev = eventsQueue.shift()!;
              items.push({ kind: 'event', id: `event:${ev.id}`, event: ev });
            }
            while (coldQueue.length > 0) {
              const ev = coldQueue.shift()!;
              items.push({ kind: 'event', id: `event:${ev.id}`, event: ev });
            }

            setFeed(items);
        } else {
            setFeed(filteredProfiles.map((p: FeedProfile) => ({ kind: 'profile' as const, id: p.id, profile: p })));
        }
      } else {
        setFeed([]);
      }
    } catch (err) {
      console.error('Error in fetchFeed:', err);
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }, [user, location, myInterests]);

  const calculateRawMatchScore = (userInterests: any) => {
      if (!myInterests || !userInterests) return 0;
      let score = 0;
      Object.keys(myInterests).forEach(cat => {
          if (userInterests[cat]) {
              score += 1; // Category match
              const myTags = myInterests[cat].map((t: string) => t.toLowerCase().trim());
              userInterests[cat].forEach((t: string) => {
                  if (myTags.includes(t.toLowerCase().trim())) score += 5; // Tag match
              });
          }
      });
      return score;
  };

  const getCommonInterests = (userInterests: Record<string, string[]> | null): string[] =>
    getCommonInterestsShared(myInterests, userInterests);

  // Fetch feed when:
  // 1. Component mounts (opening tab)
  // 2. Tab comes into focus
  // 3. Manual refresh (pull-to-refresh)
  // 4. Interests change (for re-sorting)
  
  // Initial fetch on mount and when interests change
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Refresh when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    }, [fetchFeed])
  );

  const sendInterest = async (targetUserId: string) => {
      const { error } = await supabase
        .from('interests')
        .insert({
            sender_id: user?.id,
            receiver_id: targetUserId,
            status: 'pending'
        });
      
      if (error) {
          if (error.code === '23505') {
               Alert.alert('Already Connected', 'You have already sent an interest to this person.');
          } else {
               Alert.alert('Error', error.message);
          }
      } else {
          Alert.alert('Sent!', 'Interest sent successfully.');
          fetchFeed(); // Refresh feed
      }
  };

  const handleAcceptRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'accepted' })
          .eq('id', interestId);
      
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Accepted!', 'Request accepted!');
          fetchFeed(); // Refresh feed
      }
  };

  const handleDeclineRequest = async (interestId: string) => {
      const { error } = await supabase
          .from('interests')
          .update({ status: 'declined' })
          .eq('id', interestId);
      
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Declined', 'Request declined.');
          fetchFeed(); // Refresh feed
      }
  };

  const handleSafety = (targetUserId: string) => {
    if (user) {
        showSafetyOptions(user.id, targetUserId, () => {
            // Remove user from feed immediately
            setFeed(prev => prev.filter(p => p.id !== targetUserId));
        });
    }
  };

  const openProfile = (profile: FeedProfile) => {
      setSelectedProfile(profile);
      setModalVisible(true);
  };

  const openProfileFromAttendee = (u: { id: string; username?: string; full_name?: string | null; avatar_url?: string | null; is_verified?: boolean }) => {
    // Close the event modal first so the ProfileModal (also a Modal) reliably appears on top.
    setEventDetailVisible(false);
    setTimeout(() => {
      setSelectedProfile({
        id: u.id,
        username: u.username || 'user',
        full_name: (u.full_name || u.username || 'User') as any,
        bio: '',
        avatar_url: u.avatar_url || null,
        detailed_interests: null,
        relationship_goals: null,
        is_verified: !!u.is_verified,
      } as any);
      setModalVisible(true);
    }, 80);
  };

  const openProfileById = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setSelectedProfile(data as any);
      setModalVisible(true);
    }
  };

  const getCommonInterestsFor = (their: Record<string, string[]> | null | undefined): string[] => {
    if (!myInterests || !their) return [];
    const common: string[] = [];
    Object.keys(myInterests).forEach((cat) => {
      if (!their[cat]) return;
      const myTags = myInterests[cat].map((t) => t.toLowerCase().trim());
      const theirTags = their[cat].map((t) => t.toLowerCase().trim());
      const matchingTags = theirTags.filter((t) => myTags.includes(t));
      if (matchingTags.length > 0) {
        matchingTags.slice(0, 2).forEach((tag) => {
          const originalTag = their[cat].find((t) => t.toLowerCase().trim() === tag);
          if (originalTag) common.push(`${cat}: ${originalTag}`);
        });
      } else {
        common.push(cat);
      }
    });
    return common.slice(0, 4);
  };

  const calculateMatchPercentage = (userInterests: Record<string, string[]> | null) =>
    calculateMatchPercentageShared(myInterests, userInterests);

  return (
    <View className="flex-1 bg-transparent" {...cityFeedPanResponder.panHandlers}>
      <FlatList
        data={feed}
        renderItem={({ item }) => (
            item.kind === 'profile' ? (
              <CityFeedCard 
                  item={item.profile} 
                  width={width} 
                  listHeight={listHeight} 
                  tabBarHeight={tabBarHeight} 
                  router={router} 
                  sendInterest={sendInterest} 
                  handleSafety={handleSafety} 
                  openProfile={openProfile}
                  percentage={calculateMatchPercentage(item.profile.detailed_interests)}
                  getCommonInterests={getCommonInterests}
                  handleAcceptRequest={handleAcceptRequest}
                  handleDeclineRequest={handleDeclineRequest}
              />
            ) : (
              <CityEventCard
                event={item.event}
                width={width}
                listHeight={listHeight}
                myIsVerified={myIsVerified}
                myInterest={item.event.my_interest || null}
                onView={() => {
                  setSelectedEvent(item.event);
                  setEventDetailVisible(true);
                  setEventAttendees(null);

                  supabase
                    .from('club_event_rsvps')
                    .select('user_id, status')
                    .eq('event_id', item.event.id)
                    .then(async ({ data }) => {
                      const rows = (data || []) as any[];
                      const ids = [...new Set(rows.map((r) => r.user_id))];
                      const hostId = item.event.created_by;
                      const idsToFetch = ids.length > 0 ? ids : (hostId ? [hostId] : []);
                      if (idsToFetch.length === 0) {
                        setEventAttendees([]);
                        return;
                      }

                      const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url, is_verified')
                        .in('id', idsToFetch);
                      const pmap = new Map((profs || []).map((p: any) => [p.id, p]));

                      if (ids.length === 0 && hostId) {
                        const host = pmap.get(hostId);
                        if (host) {
                          setEventAttendees([{ ...host, status: 'host' }]);
                        } else {
                          setEventAttendees([{ id: hostId, username: 'Host', full_name: null, avatar_url: null, status: 'host' } as any]);
                        }
                        return;
                      }

                      setEventAttendees(
                        rows.map((r) => ({
                          ...(pmap.get(r.user_id) || { id: r.user_id, username: 'Unknown', full_name: null, avatar_url: null }),
                          status: r.status,
                        })),
                      );
                    });
                }}
                onInterested={async () => {
                  if (!user?.id) return;
                  try {
                    const { error } = await supabase
                      .from('event_interests')
                      .upsert(
                        { event_id: item.event.id, user_id: user.id, status: 'interested' },
                        { onConflict: 'event_id,user_id' },
                      );
                    if (error) throw error;

                    // Remove it immediately from the discovery feed (it will appear in Inbox -> Upcoming Events).
                    setFeed((prev) => prev.filter((it) => !(it.kind === 'event' && it.event.id === item.event.id)));

                    // Jump straight to the event page (also reachable via Inbox -> Upcoming Events).
                    router.push({ pathname: '/events/[id]', params: { id: item.event.id } } as any);
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Could not mark interested.');
                  }
                }}
                onNotInterested={async () => {
                  if (!user?.id) return;
                  try {
                    const { error } = await supabase
                      .from('event_interests')
                      .upsert(
                        { event_id: item.event.id, user_id: user.id, status: 'not_interested' },
                        { onConflict: 'event_id,user_id' },
                      );
                    if (error) throw error;

                    // Remove it immediately and never show again
                    setFeed((prev) => prev.filter((it) => !(it.kind === 'event' && it.event.id === item.event.id)));
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Could not hide this event.');
                  }
                }}
                onRSVP={async () => {
                  if (!user?.id) return;
                  if (!myIsVerified) {
                    setVerifyModalVisible(true);
                    return;
                  }
                  try {
                    const { error } = await supabase
                      .from('club_event_rsvps')
                      .upsert(
                        { event_id: item.event.id, user_id: user.id, status: 'going' },
                        { onConflict: 'event_id,user_id' },
                      );
                    if (error) throw error;
                    fetchFeed();
                    Alert.alert('RSVP sent', 'Your RSVP was sent. Your profile was submitted to the club owners/admins.');
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Could not RSVP.');
                  }
                }}
              />
            )
        )}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFeed} tintColor="white" />}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        decelerationRate="fast"
        ListEmptyComponent={
            loading ? (
                <View style={{ height: listHeight }} className="items-center justify-center">
                    <ActivityIndicator size="large" color="white" />
                    <Text className="text-white mt-4 text-lg">Loading feed...</Text>
                </View>
            ) : (
                <View style={{ height: listHeight }} className="items-center justify-center px-10 opacity-70">
                    <IconSymbol name="moon.stars.fill" size={64} color="#A0AEC0" />
                    <Text className="text-gray-400 text-xl font-bold mt-6 text-center">It's quiet in {address?.city || 'the city'}...</Text>
                    <Text className="text-gray-600 text-base mt-2 text-center">Be the first to share your status!</Text>
                </View>
            )
        }
        ListFooterComponent={
            feed.length > 0 ? (
                <View style={{ height: listHeight, width: width }} className="bg-ink items-center justify-center px-8">
                    <IconSymbol name="checkmark.circle.fill" size={80} color="#4ade80" />
                    <Text className="text-white text-3xl font-extrabold mt-6 text-center">You're All Caught Up!</Text>
                    <Text className="text-gray-400 text-lg mt-4 text-center mb-8">
                        Start a conversation with your connections.
                    </Text>
                    <TouchableOpacity 
                        onPress={() => router.push(`/connections/${user?.id}`)}
                        className="bg-white px-8 py-4 rounded-full shadow-lg"
                    >
                        <Text className="text-ink font-bold text-lg uppercase tracking-wider">Go to Connections</Text>
                    </TouchableOpacity>
                </View>
            ) : null
        }
      />
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         myInterests={myInterests}
         myGoals={myGoals}
         onStateChange={() => {
             if (location) {
                 fetchFeed();
             }
         }}
      />

      <Modal transparent animationType="fade" visible={eventDetailVisible} onRequestClose={() => setEventDetailVisible(false)}>
        <TouchableOpacity activeOpacity={1} className="flex-1 bg-black/50 items-center justify-center px-4" onPress={() => setEventDetailVisible(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full max-w-[420px] bg-white rounded-3xl overflow-hidden max-h-[84%]">
            <View className="p-5 border-b border-gray-100">
              <Text className="text-ink font-bold text-xl">{selectedEvent?.title || 'Event'}</Text>
              <Text className="text-gray-500 mt-1">{selectedEvent?.club?.name || 'Club'}</Text>
            </View>
            <View className="p-5">
              {selectedEvent?.location ? (
                <Text className="text-ink mb-2">📍 {selectedEvent.location}</Text>
              ) : null}
              <Text className="text-gray-500 mb-4">
                {selectedEvent ? new Date(selectedEvent.event_date).toLocaleString() : ''}
              </Text>

              <Text className="text-ink font-bold mb-2">Attending / RSVPs</Text>
              <View className="rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden" style={{ height: 340 }}>
                {eventAttendees === null ? (
                  <View className="px-4 py-4">
                    <Text className="text-gray-400">Loading…</Text>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ paddingVertical: 6 }}>
                    {eventAttendees.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        className="px-4 py-3 border-b border-gray-100 flex-row items-center"
                        onPress={() => openProfileFromAttendee(u)}
                        activeOpacity={0.8}
                      >
                        <View className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mr-3">
                          {u.avatar_url ? <FeedImage path={u.avatar_url} containerHeight={40} containerWidth={40} /> : null}
                        </View>
                        <View className="flex-1">
                          <Text className="text-ink font-semibold">
                            {u.full_name || u.username}
                          </Text>
                          <Text className="text-gray-400 text-xs">{String(u.status).toUpperCase()}</Text>
                        </View>
                        {u.is_verified ? (
                          <View className="ml-2">
                            <IconSymbol name="checkmark.seal.fill" size={16} color="#3B82F6" />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <TouchableOpacity
                className="mt-4 bg-gray-100 py-3 rounded-2xl items-center"
                onPress={() => {
                  setEventDetailVisible(false);
                  router.push(`/clubs/${selectedEvent?.club_id}?tab=events&event=${selectedEvent?.id}`);
                }}
              >
                <Text className="text-gray-700 font-bold">View Club</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent animationType="fade" visible={verifyModalVisible} onRequestClose={() => setVerifyModalVisible(false)}>
        <TouchableOpacity activeOpacity={1} className="flex-1 bg-black/50 items-center justify-center px-4" onPress={() => setVerifyModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} className="w-full max-w-[420px] bg-white rounded-3xl overflow-hidden">
            <View className="p-5 border-b border-gray-100">
              <Text className="text-ink font-bold text-xl">Get Verified</Text>
              <Text className="text-gray-500 mt-1">Unlock RSVPs, club creation, and posting.</Text>
            </View>
            <View className="p-5">
              <Text className="text-gray-700 mb-4">
                Verification helps keep Proxyme safe. Get verified by inviting 3 friends using your friend code.
              </Text>

              <View className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4">
                <Text className="text-gray-500 font-bold mb-2">Your Friend Code</Text>
                <Text className="text-ink text-2xl font-bold tracking-widest">
                  {myFriendCode || '—'}
                </Text>
                <Text className="text-gray-400 text-xs mt-2">
                  Share this code with friends so they can enter it during onboarding.
                </Text>
              </View>

              <TouchableOpacity
                className="mt-4 bg-black py-4 rounded-2xl items-center"
                onPress={() => {
                  setVerifyModalVisible(false);
                  router.push('/(settings)/get-verified');
                }}
              >
                <Text className="text-white font-bold text-lg">View verification progress</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function CityEventCard({
  event,
  width,
  listHeight,
  myIsVerified,
  myInterest,
  onView,
  onInterested,
  onNotInterested,
  onRSVP,
}: {
  event: PublicEvent;
  width: number;
  listHeight: number;
  myIsVerified: boolean;
  myInterest: 'interested' | 'not_interested' | null;
  onView: () => void;
  onInterested: () => void;
  onNotInterested: () => void;
  onRSVP: () => void;
}) {
  const d = new Date(event.event_date);
  const getBackdropUrl = () => {
    const candidate = event.image_url || event.club?.image_url || null;
    if (!candidate) return null;
    if (candidate.startsWith('http')) return candidate;
    return supabase.storage.from('avatars').getPublicUrl(candidate).data.publicUrl;
  };
  const backdrop = getBackdropUrl();
  return (
    <View style={{ width, height: listHeight }} className="bg-ink">
      {backdrop ? (
        <Image
          source={{ uri: backdrop }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
          blurRadius={4}
        />
      ) : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="bg-black/40" />

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 32, paddingTop: 60 }}>
        <Text className="text-white/70 font-bold text-xs mb-2">PUBLIC EVENT</Text>
        <Text className="text-white text-2xl font-extrabold mb-1">{event.title}</Text>
        <Text className="text-white/80 text-base mb-4">
          {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
          • {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </Text>
        {event.location ? <Text className="text-white/70 mb-3">📍 {event.location}</Text> : null}
        {event.description ? <Text className="text-white/80 mb-4">{event.description}</Text> : null}

        {event.common_interests && event.common_interests.length > 0 ? (
          <View className="flex-row flex-wrap mb-4">
            {event.common_interests.slice(0, 3).map((t) => (
              <View key={t} className="bg-white/15 border border-white/15 rounded-full px-3 py-1 mr-2 mb-2">
                <Text className="text-white text-xs font-semibold">{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="bg-white/10 rounded-2xl p-4 mb-4">
          <Text className="text-white font-bold text-lg">{event.club?.name || 'Club'}</Text>
          <Text className="text-white/60 text-sm mt-1">
            RSVP submits your profile to the club owners/admins.
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRSVP}
          className={`py-4 rounded-2xl items-center ${myIsVerified ? 'bg-white' : 'bg-white/20'}`}
          activeOpacity={0.9}
        >
          <Text className={`${myIsVerified ? 'text-ink' : 'text-white'} font-bold text-lg`}>
            {myIsVerified ? (event.my_rsvp ? 'RSVP’d (Going)' : 'RSVP (Going)') : 'Get verified to RSVP'}
          </Text>
        </TouchableOpacity>

        {/* Event-level interest actions (public events don't require club membership to attend) */}
        <View className="flex-row mt-3">
        <TouchableOpacity
            onPress={onNotInterested}
            className="flex-1 py-3 rounded-2xl items-center bg-white/10 border border-white/15 mr-2"
            activeOpacity={0.85}
          >
            <Text className="text-white/90 font-bold">Not interested</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onInterested}
            disabled={myInterest === 'interested'}
            className={`flex-1 py-3 rounded-2xl items-center ${myInterest === 'interested' ? 'bg-green-500/25 border border-green-400/30' : 'bg-white/15 border border-white/20'}`}
            activeOpacity={0.85}
          >
            <Text className={`font-bold ${myInterest === 'interested' ? 'text-white' : 'text-white'}`}>
              {myInterest === 'interested' ? 'Interested ✓' : 'Interested'}
            </Text>
          </TouchableOpacity>

        </View>

        <TouchableOpacity
          onPress={onView}
          className="mt-3 mb-6 items-center"
          activeOpacity={0.85}
          hitSlop={{ top: 16, bottom: 16, left: 24, right: 24 }}
        >
          <View className="px-6 py-3 rounded-full bg-white/15 border border-white/20">
            <Text className="text-white font-bold">View event details</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CityFeedCard({ 
    item, 
    width, 
    listHeight, 
    tabBarHeight, 
    router, 
    sendInterest, 
    handleSafety, 
    openProfile,
    percentage,
    getCommonInterests,
    handleAcceptRequest,
    handleDeclineRequest
}: { 
    item: FeedProfile, 
    width: number, 
    listHeight: number, 
    tabBarHeight: number, 
    router: any, 
    sendInterest: (id: string) => void, 
    handleSafety: (id: string) => void,
    openProfile: (profile: FeedProfile) => void,
    percentage: number,
    getCommonInterests: (userInterests: Record<string, string[]> | null) => string[];
    handleAcceptRequest: (interestId: string) => void;
    handleDeclineRequest: (interestId: string) => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [showProfilePrompt, setShowProfilePrompt] = useState(false);
    const statuses = item.statuses || [];
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    
    // Animated progress bars for each status
    const progressAnimsRef = useRef<Animated.Value[]>([]);
    
    // Initialize progress animations when statuses change
    useEffect(() => {
        if (statuses.length !== progressAnimsRef.current.length) {
            progressAnimsRef.current = statuses.map(() => new Animated.Value(0));
        }
    }, [statuses.length]);
    
    // Show profile prompt slide after last status
    const isShowingProfilePrompt = showProfilePrompt && activeIndex >= statuses.length;
    const currentStatus = isShowingProfilePrompt ? null : statuses[activeIndex];
    const lastImageStatus = statuses.filter(s => s.type === 'image').pop();

    // Prefetch the next image(s) so tapping "next" feels instant.
    useEffect(() => {
        const prefetchAt = (idx: number) => {
            const st = statuses[idx];
            if (!st || st.type !== 'image' || !st.content) return;
            const url = resolvePublicAvatarUrl(st.content);
            if (url) {
                // best-effort; ignore failures
                void Image.prefetch(url);
            }
        };

        // Preload next 2 images (if any)
        prefetchAt(activeIndex + 1);
        prefetchAt(activeIndex + 2);
    }, [activeIndex, statuses]);

    // Animate progress bar for current status
    useEffect(() => {
        if (isPaused || isShowingProfilePrompt || activeIndex >= statuses.length || !progressAnimsRef.current[activeIndex]) {
            // Pause animation
            progressAnimsRef.current[activeIndex]?.stopAnimation();
            return;
        }

        // Reset and animate current progress bar
        progressAnimsRef.current[activeIndex].setValue(0);
        const anim = Animated.timing(progressAnimsRef.current[activeIndex], {
            toValue: 1,
            duration: 5000,
            useNativeDriver: false, // Width animation doesn't support native driver
        });

        anim.start(({ finished }) => {
            if (finished && !isPaused) {
                if (activeIndex < statuses.length - 1) {
                    setActiveIndex(activeIndex + 1);
                } else {
                    // After last status, show profile prompt
                    setShowProfilePrompt(true);
                    setActiveIndex(statuses.length);
                }
            }
        });

        return () => {
            anim.stop();
        };
    }, [activeIndex, isPaused, statuses.length, isShowingProfilePrompt]);

    // Reset when item changes
    useEffect(() => {
        setActiveIndex(0);
        setShowProfilePrompt(false);
        setIsPaused(false);
        // Reset all progress bars
        progressAnimsRef.current.forEach(anim => anim.setValue(0));
    }, [item.id]);

    const handleTap = (evt: any) => {
        if (isShowingProfilePrompt) {
            openProfile(item);
            return;
        }

        const x = evt.nativeEvent.locationX;
        if (x < width * 0.3) {
            // Previous
            if (activeIndex > 0) {
                setActiveIndex(activeIndex - 1);
                setShowProfilePrompt(false);
            }
        } else {
            // Next
            if (activeIndex < statuses.length - 1) {
                setActiveIndex(activeIndex + 1);
                setShowProfilePrompt(false);
            } else {
                // If last, show profile prompt
                setShowProfilePrompt(true);
                setActiveIndex(statuses.length);
            }
        }
    };

    const handlePressIn = () => {
        setIsPaused(true);
    };

    const handlePressOut = () => {
        setIsPaused(false);
    };

    // Slide down gesture to open profile
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Only trigger on downward swipes (dy > dx and dy > 50px)
                return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 50;
            },
            onPanResponderRelease: (evt, gestureState) => {
                // If swiped down more than 100px, open profile
                if (gestureState.dy > 100) {
                    openProfile(item);
                }
            },
        })
    ).current;

    const primaryGoal = item.relationship_goals?.[0];
    const theme = getTheme(primaryGoal);
    const isConnected = !!item.connection_id;
    
    // Get common interests
    const commonInterests = getCommonInterests ? getCommonInterests(item.detailed_interests) : [];

    if (!currentStatus && !isShowingProfilePrompt) return null;

    return (
      <View style={{ height: listHeight, width: width }} className="bg-black relative shadow-2xl overflow-hidden">
        
        {/* Status Progress Bars with Animation */}
        {!isShowingProfilePrompt && (
            <View className="absolute top-14 left-2 right-2 flex-row gap-1 z-50 h-1">
                {statuses.map((_, i) => {
                    const progressAnim = progressAnimsRef.current[i];
                    const progressWidth = progressAnim ? progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                    }) : '0%';
                    
                    return (
                        <View 
                            key={i} 
                            className="flex-1 h-full rounded-full bg-white/30 overflow-hidden"
                        >
                            {i === activeIndex && progressAnim ? (
                                <Animated.View
                                    style={{
                                        width: progressWidth,
                                        height: '100%',
                                        backgroundColor: 'white',
                                        borderRadius: 999,
                                    }}
                                />
                            ) : i < activeIndex ? (
                                <View className="w-full h-full bg-white rounded-full" />
                            ) : null}
                        </View>
                    );
                })}
            </View>
        )}

        {/* Content Area (Tap to Advance / Hold to Pause / Slide Down for Profile) */}
        <View 
            style={{ width, height: listHeight }}
            {...panResponder.panHandlers}
        >
            <TouchableWithoutFeedback 
                onPress={handleTap}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
            >
                <View style={{ width, height: listHeight }}>
                {isShowingProfilePrompt ? (
                    // Profile Prompt Slide - Blurred last photo
                    <View style={{ width, height: listHeight, position: 'relative' }}>
                        {lastImageStatus ? (
                            <>
                                <FeedImage path={lastImageStatus.content} containerHeight={listHeight} containerWidth={width} />
                                {/* Strong blur effect using multiple dark overlays */}
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)' }} />
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.3)' }} />
                            </>
                        ) : (
                            <View className="w-full h-full bg-ink" />
                        )}
                        <View 
                            style={{ 
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 32,
                                paddingVertical: 32
                            }}
                        >
                            <View style={{ alignItems: 'center' }}>
                                <View className="w-32 h-32 rounded-full overflow-hidden mb-4 border-4 border-white/50" style={{ position: 'relative' }}>
                                    <FeedImage path={item.avatar_url} containerHeight={128} containerWidth={128} />
                                    {/* Verified badge on avatar */}
                                    {item.is_verified && (
                                        <View
                                            style={{
                                                position: 'absolute',
                                                bottom: 0,
                                                right: 0,
                                                backgroundColor: '#3B82F6',
                                                borderRadius: 14,
                                                width: 28,
                                                height: 28,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                shadowColor: '#000',
                                                shadowOffset: { width: 0, height: 2 },
                                                shadowOpacity: 0.3,
                                                shadowRadius: 4,
                                                elevation: 5,
                                                borderWidth: 2.5,
                                                borderColor: '#fff',
                                            }}
                                        >
                                            <IconSymbol name="checkmark.seal.fill" size={16} color="#fff" />
                                        </View>
                                    )}
                                </View>
                                <Text className="text-white text-3xl font-bold mb-2 text-center shadow-lg">
                                    View {item.full_name}'s Profile
                                </Text>
                                <Text className="text-white/80 text-lg text-center mb-6 shadow-md">
                                    Tap to see more
                                </Text>
                                <TouchableOpacity
                                    onPress={() => openProfile(item)}
                                    className="bg-white px-8 py-4 rounded-full shadow-xl mb-4"
                                >
                                    <Text className="text-black font-bold text-lg">View Profile</Text>
                                </TouchableOpacity>
                                {/* Replay Button - Circular Arrow Icon */}
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setActiveIndex(0);
                                        setShowProfilePrompt(false);
                                    }}
                                    className="w-14 h-14 bg-white/20 rounded-full items-center justify-center border-2 border-white/50 backdrop-blur-md shadow-xl"
                                >
                                    <IconSymbol name="arrow.counterclockwise" size={24} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : currentStatus ? (
                    <>
                        {currentStatus.type === 'image' ? (
                            <FeedImage path={currentStatus.content} containerHeight={listHeight} containerWidth={width} />
                        ) : (
                            <View className="w-full h-full items-center justify-center bg-ink p-8">
                                <Text className="text-white text-2xl font-bold italic text-center leading-9">
                                    "{currentStatus.content}"
                                </Text>
                            </View>
                        )}
                        {/* Gradient Overlay for Text Visibility if Image */}
                        {currentStatus.type === 'image' && (
                            <View className="absolute inset-0 bg-black/10" />
                        )}
                    </>
                ) : null}
            </View>
        </TouchableWithoutFeedback>
        </View>
            
        {/* Top Overlay: Compact Header */}
        {!isShowingProfilePrompt && (
            <View className="absolute top-0 left-0 right-0 pt-16 pb-4 px-4 pointer-events-none">
            <View className="flex-row items-center mt-4">
                 <TouchableOpacity onPress={() => openProfile(item)} className="flex-row items-center">
                    {/* Small Avatar next to name */}
                    <View className="w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/50" style={{ position: 'relative' }}>
                        <FeedImage path={item.avatar_url} containerHeight={32} containerWidth={32} />
                        {/* Verified badge on small avatar */}
                        {item.is_verified && (
                            <View
                                style={{
                                    position: 'absolute',
                                    bottom: -2,
                                    right: -2,
                                    backgroundColor: '#3B82F6',
                                    borderRadius: 7,
                                    width: 14,
                                    height: 14,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 2,
                                    elevation: 4,
                                    borderWidth: 1.5,
                                    borderColor: '#fff',
                                }}
                            >
                                <IconSymbol name="checkmark.seal.fill" size={8} color="#fff" />
                            </View>
                        )}
                    </View>
                    <View>
                        <View className="flex-row items-center">
                            <Text className="text-white text-base font-bold mr-1 shadow-md">{item.full_name}</Text>
                            {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                        </View>
                        <View className="flex-row items-center">
                            <Text className="text-gray-300 text-[10px] font-semibold shadow-sm">@{item.username}</Text>
                            {currentStatus && (
                                <Text className="text-gray-400 text-[9px] ml-2 shadow-sm">
                                    • {formatTimeAgo(currentStatus.created_at)}
                                </Text>
                            )}
                        </View>
                    </View>
                 </TouchableOpacity>

                 <View className="ml-auto flex-row items-center bg-black/30 px-2 py-0.5 rounded border border-white/10 backdrop-blur-md">
                     <IconSymbol name="location.fill" size={10} color="#E5E7EB" style={{marginRight:3}}/>
                     <Text className="text-gray-200 text-[10px] font-bold uppercase shadow-sm">
                        {item.city ? item.city : Math.round(item.dist_meters / 1000) + 'km'}
                     </Text>
                 </View>
            </View>
            {percentage > 0 && (
                 <View className="self-start mt-2 bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                      <Text className="text-white text-xs font-bold">{percentage}% Match</Text>
                 </View>
            )}
        </View>
        )}

        {/* Bottom Overlay: Caption/Bio & Actions */}
        {!isShowingProfilePrompt && (
            <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12" style={{ paddingBottom: tabBarHeight - 8 }}>
            <View className="flex-row items-end justify-between">
                {/* Left Column: Text Content */}
                <View className="flex-1 mr-4">
                    {/* If Image, show Caption or Text status - Big text at top */}
                    {currentStatus?.caption && (
                        <Text className="text-white text-2xl font-bold mb-3 leading-8 shadow-lg">
                            {currentStatus.caption}
                        </Text>
                    )}
                    
                    {/* Relationship Goals */}
                    {item.relationship_goals && item.relationship_goals.length > 0 && (
                        <View className="flex-row mb-2 flex-wrap">
                            {item.relationship_goals.map((goal, idx) => {
                                const goalTheme = getTheme(goal);
                                return (
                                    <View key={idx} className={`px-2 py-0.5 rounded mr-2 mb-1 border ${goalTheme.border} ${goalTheme.badge}`}>
                                        <Text className={`${goalTheme.text} text-[10px] font-bold uppercase tracking-wider`}>{goal}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Common Interests */}
                    {commonInterests.length > 0 && (
                        <View className="flex-row items-center flex-wrap mb-2">
                            <IconSymbol name="star.fill" size={12} color="#FFD700" style={{ marginRight: 4 }} />
                            <Text className="text-white text-xs font-bold mr-1.5 shadow-sm">Common interests:</Text>
                            {commonInterests.map((interest, idx) => (
                                <Text key={idx} className="text-white/90 text-xs font-medium mr-1.5 shadow-sm">
                                    {interest.split(': ').pop()}{idx < commonInterests.length - 1 ? ',' : ''}
                                </Text>
                            ))}
                        </View>
                    )}

                    {/* Bio Teaser */}
                    <Text className="text-gray-200 text-xs leading-4 mb-2 font-medium shadow-sm opacity-80" numberOfLines={2}>
                        {item.bio}
                    </Text>

                    {/* Detailed Interests Preview */}
                    {item.detailed_interests && (
                        <View className="flex-row flex-wrap mb-1 opacity-70">
                            {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                                <Text key={i} className="text-white text-[10px] mr-2">
                                    #{cat}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* Right Column: Actions */}
                <View className="items-center pb-1 gap-y-4 mb-6">
                     <TouchableOpacity 
                        className="w-10 h-10 bg-black/20 rounded-full items-center justify-center backdrop-blur-md border border-white/10"
                        onPress={(e) => {
                            e.stopPropagation(); 
                            handleSafety(item.id);
                        }}
                    >
                        <IconSymbol name="ellipsis" size={20} color="white" />
                    </TouchableOpacity>

                    {isConnected ? (
                        <TouchableOpacity 
                            className="w-10 h-10 rounded-full items-center justify-center shadow-xl bg-ink border border-white/10"
                            onPress={(e) => {
                                e.stopPropagation();
                                router.push(`/chat/${item.connection_id}`);
                            }}
                        >
                            <IconSymbol name="bubble.left.fill" size={18} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            className={`w-10 h-10 rounded-full items-center justify-center shadow-xl ${theme.button} border border-white/10 bg-opacity-80`}
                            onPress={(e) => {
                                e.stopPropagation(); 
                                openProfile(item);
                            }}
                        >
                            <IconSymbol name="eye.fill" size={18} color="white" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
        )}
      </View>
    );
}

const getTheme = (goal?: string) => {
    switch(goal) {
        case 'Romance': return { button: 'bg-romance', badge: 'bg-romance/20', text: 'text-romance', border: 'border-romance/50' };
        case 'Friendship': return { button: 'bg-friendship', badge: 'bg-friendship/20', text: 'text-friendship', border: 'border-friendship/50' };
        case 'Professional': return { button: 'bg-business', badge: 'bg-business/20', text: 'text-business', border: 'border-business/50' };
        default: return { button: 'bg-white', badge: 'bg-white/20', text: 'text-white', border: 'border-white/20' };
    }
};

function FeedImage({ path, containerHeight, containerWidth }: { path: string | null, containerHeight?: number, containerWidth?: number }) {
    const url = useMemo(() => resolvePublicAvatarUrl(path), [path]);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

    // Get image dimensions when URL loads (only for main feed images, not avatars)
    useEffect(() => {
        if (!url || !containerHeight || !containerWidth || containerHeight < 100) return; // Skip for small avatars
        
        Image.getSize(url, (width, height) => {
            setImageDimensions({ width, height });
        }, () => {
            // If getSize fails, assume square
            setImageDimensions({ width: 1, height: 1 });
        });
    }, [url, containerHeight, containerWidth]);
  
    if (!url) return <View className="w-full h-full bg-ink" />;

    // For avatars (small containers), always use cover to fill the circle
    if (containerHeight && containerWidth && containerHeight < 100) {
        return (
            <Image 
                source={{ uri: url }} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
            />
        );
    }

    // For main feed images (not avatars), check orientation and apply appropriate display
    if (containerHeight && containerWidth && containerHeight > 100 && imageDimensions) {
        const imageAspect = imageDimensions.width / imageDimensions.height;
        
        // If image is landscape (width > height, aspect > 1), letterbox it with black bars
        // If image is vertical (height > width, aspect < 1), fill the screen
        if (imageAspect > 1) {
            // Image is landscape (wider than tall) - letterbox (black bars top/bottom)
            const imageDisplayHeight = containerWidth / imageAspect;
            
            return (
                <View className="w-full h-full bg-black items-center justify-center">
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: containerWidth, height: imageDisplayHeight }}
                        resizeMode="contain"
                    />
                </View>
            );
        } else {
            // Image is vertical or square (height >= width) - fill the screen without cropping
            // Use contain to show full image, then center it
            const imageAspect = imageDimensions.width / imageDimensions.height;
            const containerAspect = containerWidth / containerHeight;
            
            if (imageAspect < containerAspect) {
                // Image is taller relative to container - fit height, center horizontally
                const imageDisplayWidth = containerHeight * imageAspect;
                return (
                    <View className="w-full h-full bg-black items-center justify-center">
                        <Image 
                            source={{ uri: url }} 
                            style={{ width: imageDisplayWidth, height: containerHeight }}
                            resizeMode="contain"
                        />
                    </View>
                );
            } else {
                // Image fits width - fill screen
                return (
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                    />
                );
            }
        }
    }
  
    // Default: fill screen (for avatars or when dimensions aren't loaded yet)
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}

function formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    // For older posts, show date
    return time.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
