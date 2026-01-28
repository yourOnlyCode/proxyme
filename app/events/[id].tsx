import { StickyInputLayout } from '@/components/KeyboardAwareLayout';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { IconSymbol } from '@/components/ui/icon-symbol';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { getUserConnectionsList } from '../../lib/connections';
import { supabase } from '../../lib/supabase';

type EventRow = {
  id: string;
  club_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  event_date: string;
  duration_minutes?: number | null;
  ends_at?: string | null;
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

type AttendeeUser = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
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

function MiniAvatar({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (path.startsWith('http')) {
      setUrl(path);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#E5E7EB',
        borderWidth: 2,
        borderColor: 'white',
        overflow: 'hidden',
      }}
    >
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} /> : null}
    </View>
  );
}

function AttendeesModal({
  visible,
  onClose,
  title,
  users,
  onViewProfile,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  users: AttendeeUser[];
  onViewProfile: (id: string) => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} className="flex-1 bg-black/30 items-center justify-center px-4" onPress={onClose}>
        <TouchableOpacity activeOpacity={1} className="w-full max-w-[420px] bg-white rounded-3xl overflow-hidden max-h-[70%]">
          <View className="px-5 py-4 border-b border-gray-100 flex-row items-center">
            <Text className="text-ink font-bold text-lg flex-1">{title}</Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <IconSymbol name="xmark" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {users.map((u) => (
              <TouchableOpacity
                key={u.id}
                className="px-5 py-3 flex-row items-center border-b border-gray-50"
                activeOpacity={0.85}
                onPress={() => onViewProfile(u.id)}
              >
                <View className="mr-3">
                  <MiniAvatar path={u.avatar_url} />
                </View>
                <View className="flex-1">
                  <Text className="text-ink font-semibold">{u.full_name || u.username}</Text>
                  {u.full_name ? <Text className="text-gray-400 text-xs">@{u.username}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  const [isUserEvent, setIsUserEvent] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [organizerUpdate, setOrganizerUpdate] = useState<OrganizerUpdateRow | null>(null);
  const [organizerDraft, setOrganizerDraft] = useState('');

  const [myIsVerified, setMyIsVerified] = useState(false);
  const [myRsvp, setMyRsvp] = useState<'going' | 'maybe' | 'cant' | null>(null);
  const [myInterest, setMyInterest] = useState<'interested' | 'not_interested' | null>(null);

  const [draft, setDraft] = useState('');
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);

  // Edit event (organizer only)
  const [editEventVisible, setEditEventVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState(new Date());
  const [editLocation, setEditLocation] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Profile modal state (tap commenters)
  const [profileVisible, setProfileVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [attendanceByUser, setAttendanceByUser] = useState<Record<string, 'going' | 'not_going' | 'interested'>>({});
  const [attendingUsers, setAttendingUsers] = useState<AttendeeUser[]>([]);
  const [attendingCount, setAttendingCount] = useState(0);
  const [attendeesModalVisible, setAttendeesModalVisible] = useState(false);
  const listRef = useRef<FlatList<CommentRow>>(null);

  const isOrganizer = useMemo(() => !!(user?.id && event?.created_by && user.id === event.created_by), [user?.id, event?.created_by]);

  // Invites (host -> connections)
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);

  const happeningNow = useMemo(() => {
    if (!event?.event_date) return false;
    const start = new Date(event.event_date);
    const end = event.ends_at
      ? new Date(event.ends_at)
      : new Date(start.getTime() + ((event.duration_minutes ?? 120) as number) * 60_000);
    const now = new Date();
    return start <= now && end >= now;
  }, [event?.event_date, event?.ends_at, event?.duration_minutes]);

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
      const [{ data: uev }, { data: cev }, { data: prof }] = await Promise.all([
        supabase
          .from('user_events')
          .select('id, created_by, title, description, event_date, duration_minutes, ends_at, location, image_url, is_public')
          .eq('id', eventId)
          .maybeSingle(),
        supabase
          .from('club_events')
          .select('id, club_id, created_by, title, description, event_date, duration_minutes, ends_at, location, image_url, is_public, club:clubs(id, name, image_url)')
          .eq('id', eventId)
          .maybeSingle(),
        user
          ? supabase.from('profiles').select('is_verified').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const isUser = !!uev;
      setIsUserEvent(isUser);
      const resolved = isUser ? ({ ...(uev as any), club_id: null, club: null } as any) : ((cev as any) || null);
      setEvent(resolved);
      setMyIsVerified(!!(prof as any)?.is_verified);

      if (user?.id) {
        const rsvpTable = isUser ? 'user_event_rsvps' : 'club_event_rsvps';
        const interestTable = isUser ? 'user_event_interests' : 'event_interests';
        const [{ data: rsvp }, { data: interest, error: interestErr }] = await Promise.all([
          supabase
            .from(rsvpTable)
            .select('status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from(interestTable)
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

      // Attending users (below RSVP card): show "going" users with avatar stack (same logic as club EventCard).
      try {
        const rsvpTable = isUser ? 'user_event_rsvps' : 'club_event_rsvps';
        const { data: rows, error: rowsErr } = await supabase
          .from(rsvpTable)
          .select('user_id, status')
          .eq('event_id', eventId);
        if (rowsErr) throw rowsErr;

        const goingIds = Array.from(
          new Set<string>(((rows as any[]) || []).filter((r: any) => r?.status === 'going').map((r: any) => String(r.user_id))),
        ).filter(Boolean);

        // Match club EventCard behavior: if nobody is going yet, show the host as the fallback avatar.
        const fallbackHostId = resolved?.created_by ? String(resolved.created_by) : null;
        const effectiveIds = goingIds.length > 0 ? goingIds : (fallbackHostId ? [fallbackHostId] : []);

        if (effectiveIds.length === 0) {
          setAttendingUsers([]);
          setAttendingCount(0);
        } else {
          const { data: profiles, error: profErr } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, is_verified')
            .in('id', effectiveIds);
          if (profErr) throw profErr;

          const map = new Map<string, AttendeeUser>(((profiles as any[]) || []).map((p: any) => [String(p.id), p as AttendeeUser]));
          const ordered = effectiveIds.map((id) => map.get(String(id))).filter(Boolean) as AttendeeUser[];

          setAttendingUsers(ordered);
          setAttendingCount(goingIds.length); // keep count = real "going" count (host fallback doesn't inflate count)
        }
      } catch {
        setAttendingUsers([]);
        setAttendingCount(0);
      }

      const { data: comm } = await supabase
        .from(isUser ? 'user_event_comments' : 'event_comments')
        .select('id, content, created_at, user:user_id(id, username, full_name, avatar_url, is_verified)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      setComments(((comm as any[]) || []) as any);

      // Organizer update (best-effort; table may not exist yet on older DBs)
      try {
        const { data: upd, error: updErr } = await supabase
          .from(isUser ? 'user_event_updates' : 'event_updates')
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
          const rsvpTable = isUser ? 'user_event_rsvps' : 'club_event_rsvps';
          const interestTable = isUser ? 'user_event_interests' : 'event_interests';
          const [{ data: rsvps }, { data: interests, error: interestsErr }] = await Promise.all([
            supabase.from(rsvpTable).select('user_id, status').eq('event_id', eventId).in('user_id', commenterIds),
            supabase
              .from(interestTable)
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
      const interestTable = isUserEvent ? 'user_event_interests' : 'event_interests';
      const { error } = await supabase
        .from(interestTable)
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
                .from(isUserEvent ? 'user_event_interests' : 'event_interests')
                .upsert(
                  { event_id: eventId, user_id: user.id, status: 'not_interested' },
                  { onConflict: 'event_id,user_id' },
                );
              if (error) throw error;

              // Remove any RSVP so it doesn't keep the event in Upcoming Events
              await supabase
                .from(isUserEvent ? 'user_event_rsvps' : 'club_event_rsvps')
                .delete()
                .eq('event_id', eventId)
                .eq('user_id', user.id);

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
      setVerifyModalVisible(true);
      return;
    }

    const setRsvp = async (status: 'going' | 'cant') => {
      try {
        const { error } = await supabase
          .from(isUserEvent ? 'user_event_rsvps' : 'club_event_rsvps')
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

  const openInviteModal = async () => {
    if (!user?.id || !eventId || !isOrganizer) return;
    setInviteModalVisible(true);
    if (connections.length > 0) return;
    setInviteLoading(true);
    try {
      const list = await getUserConnectionsList({ targetUserId: user.id, filterIntent: null });
      setConnections(list || []);
    } catch {
      setConnections([]);
    } finally {
      setInviteLoading(false);
    }
  };

  const sendInvites = async () => {
    if (!user?.id || !eventId || inviteeIds.length === 0) {
      setInviteModalVisible(false);
      return;
    }
    try {
      const rows = inviteeIds.map((rid) => ({
        source: isUserEvent ? 'user' : 'club',
        event_id: eventId,
        sender_id: user.id,
        receiver_id: rid,
        status: 'pending',
      }));
      const { error } = await supabase.from('event_invites').upsert(rows as any, { onConflict: 'source,event_id,receiver_id' });
      if (error) {
        if ((error as any).code === '42P01') {
          Alert.alert('Setup required', 'Run the Supabase schema update for `event_invites`.');
          return;
        }
        throw error;
      }
      Alert.alert('Invites sent', `Sent ${inviteeIds.length} invite${inviteeIds.length === 1 ? '' : 's'}.`);
      setInviteModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send invites.');
    }
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

      const { error } = await supabase
        .from(isUserEvent ? 'user_event_comments' : 'event_comments')
        .insert({ event_id: eventId, user_id: user.id, content });
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
        .from(isUserEvent ? 'user_event_updates' : 'event_updates')
        .upsert({ event_id: eventId, created_by: user.id, content }, { onConflict: 'event_id' });
      if (error) throw error;
      fetchAll({ silent: true });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not post organizer update.');
    }
  };

  const openEditEvent = () => {
    if (!event) return;
    setEditTitle(event.title);
    setEditDescription(event.description || '');
    setEditDate(new Date(event.event_date));
    setEditLocation(event.location || '');
    setEditIsPublic(event.is_public);
    setEditEventVisible(true);
  };

  const saveEditEvent = async () => {
    if (!eventId || !editTitle.trim()) {
      Alert.alert('Error', 'Event title is required.');
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from(isUserEvent ? 'user_events' : 'club_events')
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          event_date: editDate.toISOString(),
          location: editLocation.trim() || null,
          is_public: editIsPublic,
        })
        .eq('id', eventId);
      if (error) throw error;
      setEditEventVisible(false);
      fetchAll({ silent: true });
      Alert.alert('Success', 'Event updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update event.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <StickyInputLayout
      headerOffset={insets.top + 52}
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      inputRowBackgroundColor="#FFFFFF"
      renderInput={() =>
        event ? (
          <View className="border-t border-gray-100 bg-white">
            <View className="p-4 flex-row items-center">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={canComment ? 'Write a comment…' : 'Mark Interested to comment…'}
                editable={canComment}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-ink"
                placeholderTextColor="#9CA3AF"
                multiline
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
        ) : null
      }
    >
      <View className="flex-1" style={{ paddingTop: insets.top, backgroundColor: '#FFFFFF' }}>
        <ProfileModal
          visible={profileVisible}
          profile={selectedProfile}
          onClose={() => setProfileVisible(false)}
        />

        <AttendeesModal
          visible={attendeesModalVisible}
          onClose={() => setAttendeesModalVisible(false)}
          title={attendingCount > 0 ? `Attending (${attendingCount})` : 'Attending'}
          users={attendingUsers}
          onViewProfile={(uid) => {
            setAttendeesModalVisible(false);
            openProfileById(uid);
          }}
        />

        {/* Backdrop fades in (not sliding with sheet) */}
        <Modal visible={verifyModalVisible} animationType="fade" transparent>
          <View className="flex-1 justify-end bg-black/40">
            <View className="bg-white rounded-t-3xl px-6 pt-6" style={{ paddingBottom: 24 + insets.bottom }}>
              <Text className="text-ink text-lg font-bold text-center">Verify to RSVP</Text>
              <Text className="text-gray-500 text-center mt-2 mb-4">
                Link your Apple or Google account to verify and RSVP to this event.
              </Text>
              <SocialAuthButtons mode="link" onComplete={() => { setVerifyModalVisible(false); fetchAll({ silent: true }); }} />
              <TouchableOpacity onPress={() => setVerifyModalVisible(false)} className="mt-4 py-3 rounded-2xl items-center bg-gray-100">
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={inviteModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setInviteModalVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
            <View
              style={{
                backgroundColor: 'white',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 20,
                paddingBottom: insets.bottom + 20,
                maxHeight: '80%',
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>Invite connections</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>Selected: {inviteeIds.length}</Text>
              </View>

              <TextInput
                value={inviteSearch}
                onChangeText={setInviteSearch}
                placeholder="Search connections…"
                className="bg-gray-100 p-4 rounded-xl mb-3"
              />

              <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                {inviteLoading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator />
                  </View>
                ) : (
                  (connections || [])
                    .filter((c: any) => {
                      const q = inviteSearch.trim().toLowerCase();
                      if (!q) return true;
                      const name = `${c.full_name || ''} ${c.username || ''}`.toLowerCase();
                      return name.includes(q);
                    })
                    .map((c: any) => {
                      const cid = String(c.id);
                      const selected = inviteeIds.includes(cid);
                      return (
                        <TouchableOpacity
                          key={cid}
                          activeOpacity={0.85}
                          onPress={() => setInviteeIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]))}
                          className="flex-row items-center justify-between py-3 border-b border-gray-100"
                        >
                          <View>
                            <Text className="text-ink font-semibold">{c.full_name || c.username || 'Connection'}</Text>
                            {c.username ? <Text className="text-gray-500 text-xs">@{c.username}</Text> : null}
                          </View>
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: selected ? '#111827' : '#D1D5DB',
                              backgroundColor: selected ? '#111827' : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {selected ? <Text style={{ color: 'white', fontWeight: '700' }}>✓</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                )}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={() => setInviteModalVisible(false)}
                  style={{
                    flex: 1,
                    backgroundColor: '#F3F4F6',
                    padding: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={sendInvites}
                  style={{
                    flex: 1,
                    backgroundColor: '#111827',
                    padding: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                    opacity: inviteeIds.length === 0 ? 0.5 : 1,
                  }}
                  disabled={inviteeIds.length === 0}
                >
                  <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={editEventVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditEventVisible(false)}>
          <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
            <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-100">
              <Text className="text-xl font-bold text-ink">Edit event</Text>
              <TouchableOpacity onPress={() => setEditEventVisible(false)}>
                <Text className="text-gray-500">Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
              <View className="mb-4">
                <Text className="text-gray-500 font-bold text-sm mb-2">Title *</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Event title"
                  className="bg-gray-100 p-4 rounded-xl text-ink"
                />
              </View>
              <View className="mb-4">
                <Text className="text-gray-500 font-bold text-sm mb-2">Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="What's this event about?"
                  multiline
                  numberOfLines={4}
                  className="bg-gray-100 p-4 rounded-xl text-ink h-28"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>
              <View className="mb-4">
                <Text className="text-gray-500 font-bold text-sm mb-2">Date & time *</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }} className="flex-1 bg-gray-100 p-4 rounded-xl">
                    <Text className="text-gray-500 text-xs mb-1">Date</Text>
                    <Text className="text-ink font-semibold">{editDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }} className="flex-1 bg-gray-100 p-4 rounded-xl">
                    <Text className="text-gray-500 text-xs mb-1">Time</Text>
                    <Text className="text-ink font-semibold">{editDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {Platform.OS === 'android' && showDatePicker && (
                <DateTimePicker value={editDate} mode="date" display="default" onChange={(_, d) => { if (d) { setEditDate(d); setShowDatePicker(false); } }} />
              )}
              {Platform.OS === 'android' && showTimePicker && (
                <DateTimePicker value={editDate} mode="time" display="default" onChange={(_, d) => { if (d) { setEditDate(d); setShowTimePicker(false); } }} />
              )}
              {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
                <DateTimePicker
                  value={editDate}
                  mode={showTimePicker ? 'time' : 'date'}
                  display="spinner"
                  textColor="#111827"
                  onChange={(_, d) => {
                    if (d) setEditDate(d);
                    setShowDatePicker(false);
                    setShowTimePicker(false);
                  }}
                />
              )}
              <View className="mb-4">
                <Text className="text-gray-500 font-bold text-sm mb-2">Location</Text>
                <TextInput
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="Address or venue"
                  className="bg-gray-100 p-4 rounded-xl text-ink"
                />
              </View>
              <View className="mb-6">
                <Text className="text-gray-500 font-bold text-sm mb-2">Visibility</Text>
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setEditIsPublic(false)}
                    className={`flex-1 py-3 rounded-xl items-center mr-2 ${!editIsPublic ? 'bg-ink' : 'bg-gray-100'}`}
                  >
                    <Text className={!editIsPublic ? 'text-white' : 'text-gray-600'} style={{ fontWeight: '600' }}>
                      {event?.club_id ? 'Members only' : 'Connections only'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditIsPublic(true)}
                    className={`flex-1 py-3 rounded-xl items-center ${editIsPublic ? 'bg-ink' : 'bg-gray-100'}`}
                  >
                    <Text className={editIsPublic ? 'text-white' : 'text-gray-600'} style={{ fontWeight: '600' }}>Public</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={saveEditEvent} disabled={savingEdit || !editTitle.trim()} className={`py-4 rounded-xl items-center ${savingEdit || !editTitle.trim() ? 'bg-gray-300' : 'bg-ink'}`}>
                <Text className="text-white font-bold">{savingEdit ? 'Saving…' : 'Save changes'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        <View className="px-4 py-3 flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
              <IconSymbol name="chevron.left" size={18} color="#111827" />
            </TouchableOpacity>
            <Text className="flex-1 text-center text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
              Event
            </Text>
            {isOrganizer ? (
              <TouchableOpacity onPress={openEditEvent} className="w-10 h-10 items-center justify-center">
                <IconSymbol name="pencil" size={18} color="#111827" />
              </TouchableOpacity>
            ) : (
              <View className="w-10" />
            )}
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

                      {/* Club preview + CTA (hide for user-owned "Your events" club) */}
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
                      {happeningNow ? (
                        <View className="mt-2 self-start bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                          <Text className="text-[10px] text-red-700 font-bold">HAPPENING NOW!</Text>
                        </View>
                      ) : null}
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

                      {isOrganizer ? (
                        <TouchableOpacity
                          onPress={openInviteModal}
                          className="mt-3 py-3 rounded-2xl items-center bg-gray-50 border border-gray-200"
                          activeOpacity={0.9}
                        >
                          <Text className="text-ink font-bold">Invite connections</Text>
                        </TouchableOpacity>
                      ) : null}

                      {/* Attending (same avatar stack pattern as club EventCard) */}
                      <View className="mt-3 flex-row justify-between items-center">
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            if (attendingUsers.length > 0) setAttendeesModalVisible(true);
                          }}
                          className="flex-row items-center"
                        >
                          <View className="flex-row items-center mr-2">
                            {attendingUsers.slice(0, 6).map((a, idx) => (
                              <View key={a.id} style={{ marginLeft: idx === 0 ? 0 : -8 }}>
                                <MiniAvatar path={a.avatar_url} />
                              </View>
                            ))}
                          </View>
                          <Text className="text-xs text-gray-500 font-semibold">
                            {attendingCount > 0 ? `${attendingCount} attending` : 'No attendees yet'}
                          </Text>
                          {attendingUsers.length > 0 ? (
                            <IconSymbol name="chevron.right" size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
                          ) : null}
                        </TouchableOpacity>
                      </View>

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
            />
          )}
      </View>
    </StickyInputLayout>
  );
}

