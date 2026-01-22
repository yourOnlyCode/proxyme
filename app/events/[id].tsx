import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

type EventRow = {
  id: string;
  club_id: string;
  created_by: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string | null;
  image_url: string | null;
  is_public: boolean;
  club?: { id: string; name: string; image_url: string | null } | null;
};

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
};

type OrganizerUpdateRow = {
  event_id: string;
  created_by: string;
  content: string;
  updated_at: string;
};

function Avatar({ path, size = 40 }: { path: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    if (path.startsWith('http')) {
      setUrl(path);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View style={{ width: size, height: size }} className="rounded-full overflow-hidden bg-gray-200">
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true); // initial load only
  const [event, setEvent] = useState<EventRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [organizerUpdate, setOrganizerUpdate] = useState<OrganizerUpdateRow | null>(null);
  const [organizerDraft, setOrganizerDraft] = useState('');

  const [myIsVerified, setMyIsVerified] = useState(false);
  const [myRsvp, setMyRsvp] = useState<'going' | 'maybe' | 'cant' | null>(null);
  const [myInterest, setMyInterest] = useState<'interested' | 'not_interested' | null>(null);

  const [draft, setDraft] = useState('');

  // Profile modal state (tap commenters)
  const [profileVisible, setProfileVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [attendanceByUser, setAttendanceByUser] = useState<Record<string, 'going' | 'not_going' | 'interested'>>({});
  const listRef = useRef<FlatList<CommentRow>>(null);

  const isOrganizer = useMemo(() => !!(user?.id && event?.created_by && user.id === event.created_by), [user?.id, event?.created_by]);

  // Allow discussion participation if:
  // - user is the event organizer (created_by)
  // - user RSVP'd
  // - user marked Interested
  const canComment = useMemo(
    () => isOrganizer || myRsvp !== null || myInterest === 'interested',
    [isOrganizer, myRsvp, myInterest],
  );

  const openProfileById = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        setSelectedProfile(data as any);
        setProfileVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAll = useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!eventId) return;
    // Avoid showing a full-screen loader for background refreshes (e.g., after sending a comment).
    if (!silent) setLoading(true);
    try {
      const [{ data: ev }, { data: prof }] = await Promise.all([
        supabase
          .from('club_events')
          .select('id, club_id, created_by, title, description, event_date, location, image_url, is_public, club:clubs(id, name, image_url)')
          .eq('id', eventId)
          .maybeSingle(),
        user
          ? supabase.from('profiles').select('is_verified').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      setEvent((ev as any) || null);
      setMyIsVerified(!!(prof as any)?.is_verified);

      if (user?.id) {
        const [{ data: rsvp }, { data: interest, error: interestErr }] = await Promise.all([
          supabase
            .from('club_event_rsvps')
            .select('status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('event_interests')
            .select('status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        setMyRsvp((rsvp as any)?.status || null);
        if (interestErr && (interestErr as any).code === '42P01') {
          setMyInterest(null);
        } else {
          setMyInterest((interest as any)?.status || null);
        }
      } else {
        setMyRsvp(null);
        setMyInterest(null);
      }

      const { data: comm } = await supabase
        .from('event_comments')
        .select('id, content, created_at, user:user_id(id, username, full_name, avatar_url, is_verified)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      setComments(((comm as any[]) || []) as any);

      // Organizer update (best-effort; table may not exist yet on older DBs)
      try {
        const { data: upd, error: updErr } = await supabase
          .from('event_updates')
          .select('event_id, created_by, content, updated_at')
          .eq('event_id', eventId)
          .maybeSingle();
        if (updErr && (updErr as any).code === '42P01') {
          setOrganizerUpdate(null);
          setOrganizerDraft('');
        } else {
          setOrganizerUpdate((upd as any) || null);
          setOrganizerDraft(((upd as any)?.content as string) || '');
        }
      } catch {
        // ignore
      }

      // Attendance state for commenters (Attending / Interested)
      try {
        const commenterIds = Array.from(
          new Set<string>((((comm as any[]) || []) as any[]).map((c) => c?.user?.id).filter(Boolean)),
        );
        if (commenterIds.length > 0) {
          const [{ data: rsvps }, { data: interests, error: interestsErr }] = await Promise.all([
            supabase.from('club_event_rsvps').select('user_id, status').eq('event_id', eventId).in('user_id', commenterIds),
            supabase
              .from('event_interests')
              .select('user_id, status')
              .eq('event_id', eventId)
              .in('user_id', commenterIds)
              .eq('status', 'interested'),
          ]);

          const map: Record<string, 'going' | 'not_going' | 'interested'> = {};
          for (const r of (rsvps || []) as any[]) {
            if (!r?.user_id) continue;
            if (r.status === 'going') map[r.user_id] = 'going';
            else if (r.status === 'cant') map[r.user_id] = 'not_going';
            else if (r.status === 'maybe') map[r.user_id] = 'going'; // treat maybe as going for display
          }

          if (!(interestsErr && (interestsErr as any).code === '42P01')) {
            for (const i of (interests || []) as any[]) {
              if (!i?.user_id) continue;
              if (!map[i.user_id]) map[i.user_id] = 'interested';
            }
          }

          setAttendanceByUser(map);
        } else {
          setAttendanceByUser({});
        }
      } catch {
        setAttendanceByUser({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eventId, user?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onInterested = async () => {
    if (!user?.id || !eventId) return;
    try {
      const { error } = await supabase
        .from('event_interests')
        .upsert({ event_id: eventId, user_id: user.id, status: 'interested' }, { onConflict: 'event_id,user_id' });
      if (error) throw error;
      setMyInterest('interested');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not mark interested.');
    }
  };

  const onNotInterested = async () => {
    if (!user?.id || !eventId) return;
    Alert.alert(
      'No longer interested?',
      'This will remove the event from your Upcoming Events and it won’t appear in your City feed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Mark not interested
              const { error } = await supabase
                .from('event_interests')
                .upsert(
                  { event_id: eventId, user_id: user.id, status: 'not_interested' },
                  { onConflict: 'event_id,user_id' },
                );
              if (error) throw error;

              // Remove any RSVP so it doesn't keep the event in Upcoming Events
              await supabase.from('club_event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id);

              setMyInterest('not_interested');
              setMyRsvp(null);
              router.replace('/(tabs)/inbox');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not remove this event.');
            }
          },
        },
      ],
    );
  };

  const onRSVP = async () => {
    if (!user?.id || !eventId) return;
    if (!myIsVerified) {
      Alert.alert('Verification required', 'You need to be verified to RSVP to events.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Get Verified', onPress: () => router.push('/(settings)/get-verified') },
      ]);
      return;
    }

    const setRsvp = async (status: 'going' | 'cant') => {
      try {
        const { error } = await supabase
          .from('club_event_rsvps')
          .upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' });
        if (error) throw error;
        setMyRsvp(status);
        // Ensure the discussion badge reflects immediately for the current user.
        setAttendanceByUser((prev) => ({
          ...prev,
          [user.id]: status === 'going' ? 'going' : 'not_going',
        }));
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not RSVP.');
      }
    };

    // If no RSVP yet, ask. If already set, allow changing.
    Alert.alert(
      myRsvp ? 'Update RSVP' : 'RSVP',
      'Are you going?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not going', style: 'destructive', onPress: () => setRsvp('cant') },
        { text: 'Going', onPress: () => setRsvp('going') },
      ],
      { cancelable: true },
    );
  };

  const onSend = async () => {
    if (!user?.id || !eventId) return;
    const content = draft.trim();
    if (!content) return;

    if (!canComment) {
      Alert.alert('Join the discussion', 'Tap Interested (or RSVP) to comment on this event.');
      return;
    }

    try {
      // UX: close keyboard immediately; comment can appear when network catches up.
      Keyboard.dismiss();
      setDraft('');

      const { error } = await supabase.from('event_comments').insert({ event_id: eventId, user_id: user.id, content });
      if (error) throw error;

      // Refresh silently (no loading screen)
      fetchAll({ silent: true });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not post comment.');
    }
  };

  const onSaveOrganizerUpdate = async () => {
    if (!user?.id || !eventId || !isOrganizer) return;
    const content = organizerDraft.trim();
    if (!content) {
      Alert.alert('Update required', 'Write a short organizer update first.');
      return;
    }
    try {
      Keyboard.dismiss();
      const { error } = await supabase
        .from('event_updates')
        .upsert({ event_id: eventId, created_by: user.id, content }, { onConflict: 'event_id' });
      if (error) throw error;
      fetchAll({ silent: true });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not post organizer update.');
    }
  };

  return (
    <KeyboardDismissWrapper>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 52}
      >
        {/* Make KAV padding area match the page background so no "gray sheet" appears while keyboard animates */}
        <View className="flex-1 bg-gray-50" style={{ paddingTop: insets.top, backgroundColor: '#FFFFFF' }}>
          <ProfileModal
            visible={profileVisible}
            profile={selectedProfile}
            onClose={() => setProfileVisible(false)}
          />

          <View className="px-4 py-3 flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
              <IconSymbol name="chevron.left" size={18} color="#111827" />
            </TouchableOpacity>
            <Text className="flex-1 text-center text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
              Event
            </Text>
            <View className="w-10" />
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
              <Text className="text-gray-400 mt-3">Loading…</Text>
            </View>
          ) : !event ? (
            <View className="flex-1 items-center justify-center px-6">
              <IconSymbol name="calendar.badge.exclamationmark" size={40} color="#9CA3AF" />
              <Text className="text-gray-500 mt-4 font-semibold text-center">Event not found.</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
              ListHeaderComponent={
                <View>
                  <View className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                    <View className="p-5 border-b border-gray-100">
                      <Text className="text-ink text-2xl font-bold">{event.title}</Text>

                      {/* Club preview + CTA */}
                      {event.club?.name ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          className="flex-row items-center mt-3"
                          onPress={() => router.push(`/clubs/${event.club_id}`)}
                        >
                          <View className="w-10 h-10 rounded-xl overflow-hidden bg-gray-200 mr-3">
                            {event.club?.image_url ? <Avatar path={event.club.image_url} size={40} /> : null}
                          </View>
                          <View className="flex-1">
                            <Text className="text-gray-700 font-bold">View Club</Text>
                            <Text className="text-gray-500 text-xs" numberOfLines={1}>
                              {event.club.name}
                            </Text>
                          </View>
                          <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                      ) : null}

                      <Text className="text-gray-500 mt-4">{new Date(event.event_date).toLocaleString()}</Text>
                      {event.location ? <Text className="text-gray-500 mt-1">📍 {event.location}</Text> : null}
                    </View>

                    {event.description ? (
                      <View className="p-5">
                        <Text className="text-gray-700">{event.description}</Text>
                      </View>
                    ) : null}

                    <View className="p-5 pt-0">
                      {/* RSVP button behavior like City tab: shows verified-gated label */}
                      <TouchableOpacity
                        onPress={onRSVP}
                        className={`py-4 rounded-2xl items-center ${
                          !myIsVerified
                            ? 'bg-gray-100 border border-gray-200'
                            : myRsvp === 'going'
                            ? 'bg-green-50 border border-green-200'
                            : myRsvp === 'cant'
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-white border border-gray-200'
                        }`}
                        activeOpacity={0.9}
                      >
                        <Text
                          className={`font-bold text-lg ${
                            !myIsVerified ? 'text-gray-700' : myRsvp === 'going' ? 'text-green-700' : myRsvp === 'cant' ? 'text-red-700' : 'text-ink'
                          }`}
                        >
                          {!myIsVerified ? 'Verify to RSVP' : myRsvp === 'going' ? 'Going' : myRsvp === 'cant' ? 'Not going' : 'RSVP'}
                        </Text>
                      </TouchableOpacity>

                      {!myIsVerified ? (
                        <View className="mt-2">
                          <SocialAuthButtons mode="link" onComplete={() => fetchAll({ silent: true })} />
                        </View>
                      ) : null}

                      <View className="flex-row mt-3">
                      <TouchableOpacity
                          onPress={onNotInterested}
                          className="flex-1 py-3 rounded-2xl items-center bg-gray-50 border border-gray-200 mr-2"
                        >
                          <Text className="text-gray-700 text-xs font-bold">No longer interested</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={onInterested}
                          disabled={myInterest === 'interested'}
                          className={`flex-1 py-3 rounded-2xl items-center ${myInterest === 'interested' ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}
                        >
                          <Text className={`font-bold ${myInterest === 'interested' ? 'text-green-700' : 'text-blue-700'}`}>
                            {myInterest === 'interested' ? 'Interested ✓' : 'Interested'}
                          </Text>
                        </TouchableOpacity>

                      </View>
                    </View>
                  </View>

                  {/* Organizer update (highlighted) */}
                  {organizerUpdate?.content ? (
                    <View className="bg-blue-50 border border-blue-200 rounded-3xl px-5 py-4 mb-4 shadow-sm">
                      <View className="flex-row items-center mb-2">
                        <View className="w-9 h-9 rounded-full bg-blue-600 items-center justify-center mr-3">
                          <IconSymbol name="megaphone.fill" size={16} color="#fff" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-ink font-bold text-base">Organizer update</Text>
                          <Text className="text-gray-600 text-xs">
                            {organizerUpdate.updated_at ? new Date(organizerUpdate.updated_at).toLocaleString() : ''}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-gray-800 leading-6">{organizerUpdate.content}</Text>
                    </View>
                  ) : null}

                  {/* Organizer editor (only event creator) */}
                  {isOrganizer ? (
                    <View className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                      <View className="p-5 border-b border-gray-100">
                        <Text className="text-ink font-bold text-lg">Organizer update</Text>
                        <Text className="text-gray-500 text-xs mt-1">
                          Only you (the event organizer) can post this highlighted note. Followers will be notified.
                        </Text>
                      </View>
                      <View className="p-5">
                        <TextInput
                          value={organizerDraft}
                          onChangeText={setOrganizerDraft}
                          placeholder="Add a short update (parking info, schedule change, bring a friend...)"
                          className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-ink"
                          style={{ minHeight: 90, textAlignVertical: 'top' }}
                          multiline
                        />
                        <TouchableOpacity
                          onPress={onSaveOrganizerUpdate}
                          className="mt-3 py-3 rounded-2xl items-center bg-blue-600"
                          activeOpacity={0.9}
                        >
                          <Text className="text-white font-bold">{organizerUpdate ? 'Update note' : 'Post note'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  <View className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <View className="p-5 border-b border-gray-100">
                      <Text className="text-ink font-bold text-lg">Discussion</Text>
                      <Text className="text-gray-500 text-xs mt-1">
                        {canComment ? 'You can comment because you RSVP’d or marked Interested.' : 'Mark Interested (or RSVP) to join the discussion.'}
                      </Text>
                    </View>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const uid = item.user?.id;
                const attendance = uid ? attendanceByUser[uid] : undefined;
                return (
                  <View className="bg-white border-x border-gray-100 px-5 py-4 border-b border-gray-50 flex-row">
                    <TouchableOpacity activeOpacity={0.85} onPress={() => (uid ? openProfileById(uid) : null)}>
                      <Avatar path={item.user?.avatar_url || null} />
                    </TouchableOpacity>
                    <View className="ml-3 flex-1">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => (uid ? openProfileById(uid) : null)}
                        className="flex-row items-center"
                      >
                        <Text className="text-ink font-bold">
                          {item.user?.full_name || item.user?.username || 'User'}
                        </Text>
                        {attendance ? (
                          <View
                            className={`ml-2 px-2 py-0.5 rounded-full ${
                              attendance === 'going'
                                ? 'bg-green-50 border border-green-200'
                                : attendance === 'not_going'
                                ? 'bg-red-50 border border-red-200'
                                : 'bg-blue-50 border border-blue-200'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-bold ${
                                attendance === 'going' ? 'text-green-700' : attendance === 'not_going' ? 'text-red-700' : 'text-blue-700'
                              }`}
                            >
                              {attendance === 'going' ? 'GOING' : attendance === 'not_going' ? 'NOT GOING' : 'INTERESTED'}
                            </Text>
                          </View>
                        ) : null}
                        {/* Verification is not a social badge (no checkmark here). */}
                        <Text className="text-gray-400 text-xs ml-auto">
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </TouchableOpacity>
                      <Text className="text-gray-700 mt-1">{item.content}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View className="bg-white border-x border-gray-100 items-center py-10">
                  <Text className="text-gray-400">No comments yet.</Text>
                </View>
              }
              ListFooterComponent={
                <View className="bg-white border border-gray-100 rounded-b-3xl overflow-hidden">
                  <View className="p-4 border-t border-gray-100 flex-row items-center">
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={canComment ? 'Write a comment…' : 'Mark Interested to comment…'}
                      editable={canComment}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-ink"
                      placeholderTextColor="#9CA3AF"
                      multiline
                      onFocus={() => {
                        setTimeout(() => {
                          listRef.current?.scrollToEnd({ animated: true });
                        }, 80);
                      }}
                    />
                    <TouchableOpacity
                      onPress={onSend}
                      className={`ml-3 w-12 h-12 rounded-full items-center justify-center ${canComment ? 'bg-ink' : 'bg-gray-200'}`}
                      activeOpacity={0.9}
                    >
                      <IconSymbol name="paperplane.fill" size={16} color={canComment ? 'white' : '#6B7280'} />
                    </TouchableOpacity>
                  </View>
                </View>
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </KeyboardDismissWrapper>
  );
}

