import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  created_at: string;
};

type ActorProfile = { id: string; avatar_url: string | null };

const NOTIFICATION_ICONS: Record<string, { name: string; color: string }> = {
  forum_reply: { name: 'bubble.left.and.bubble.right.fill', color: '#3B82F6' },
  club_event: { name: 'calendar.badge.plus', color: '#10B981' },
  club_member: { name: 'person.badge.plus', color: '#8B5CF6' },
  club_invite: { name: 'envelope.badge', color: '#F59E0B' },
  club_join_request: { name: 'person.crop.circle.badge.questionmark', color: '#0EA5E9' },
  club_join_accepted: { name: 'checkmark.seal.fill', color: '#10B981' },
  connection_request: { name: 'sparkles', color: '#2563EB' },
  connection_accepted: { name: 'sparkles', color: '#2563EB' },
  event_update: { name: 'calendar.badge.clock', color: '#10B981' },
  event_organizer_update: { name: 'megaphone.fill', color: '#2563EB' },
  event_comment: { name: 'bubble.left.and.bubble.right.fill', color: '#3B82F6' },
  event_rsvp: { name: 'calendar.badge.checkmark', color: '#2563EB' },
  event_rsvp_update: { name: 'calendar.badge.checkmark', color: '#2563EB' },
  event_cancelled: { name: 'calendar.badge.minus', color: '#EF4444' },
  event_reminder: { name: 'bell.badge.fill', color: '#F59E0B' },
};

function getNotificationIcon(type: string): { name: string; color: string } {
  return NOTIFICATION_ICONS[type] ?? { name: 'bell.fill', color: '#6B7280' };
}

function getActorId(n: NotificationRow): string | null {
  const d = n.data ?? {};
  if (n.type === 'connection_request' || n.type === 'connection_accepted') return d.requester_id ?? d.partner_id ?? null;
  if (n.type === 'forum_reply') return d.replier_id ?? null;
  if (n.type === 'club_invite') return d.inviter_id ?? null;
  if (n.type === 'club_join_request') return d.requester_id ?? null;
  if (n.type === 'event_rsvp' || n.type === 'event_rsvp_update') return d.rsvp_user_id ?? null;
  return null;
}

function HistoryAvatar({ path, size = 40 }: { path: string | null; size?: number }) {
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
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#E5E7EB' }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-gray-400 font-bold" style={{ fontSize: size * 0.4 }}>?</Text>
        </View>
      )}
    </View>
  );
}

export default function NotificationHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [actorProfiles, setActorProfiles] = useState<Record<string, ActorProfile>>({});

  const fetchHistory = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setRefreshing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      if (!userId) {
        setRows([]);
        setActorProfiles({});
        return;
      }
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, data, read, created_at')
        .eq('user_id', userId)
        .eq('read', true)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (data as any[]) || [];
      setRows(list);

      const actorIds = Array.from(new Set(list.map((n) => getActorId(n as NotificationRow)).filter(Boolean))) as string[];
      if (actorIds.length === 0) {
        setActorProfiles({});
        return;
      }
      const { data: profiles } = await supabase.from('profiles').select('id, avatar_url').in('id', actorIds);
      const map: Record<string, ActorProfile> = {};
      for (const p of (profiles as any[]) || []) {
        if (p?.id) map[String(p.id)] = { id: String(p.id), avatar_url: p.avatar_url ?? null };
      }
      setActorProfiles(map);
    } catch {
      // keep screen usable even if history fetch fails
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchHistory({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <IconSymbol name="chevron.left" size={22} color="#111827" />
        </TouchableOpacity>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: 10 }}>
          <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
            Notification history
          </Text>
        </View>
        <View className="w-10 ml-auto" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-gray-400 mt-3">Loading history…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHistory()} />}
        >
          {empty ? (
            <View className="items-center mt-10">
              <IconSymbol name="clock" size={48} color="#CBD5E0" />
              <Text className="text-gray-500 font-bold text-lg mt-4">No history yet</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center">When you clear notifications, they’ll show up here.</Text>
            </View>
          ) : (
            rows.map((n) => {
              const icon = getNotificationIcon(n.type);
              const actorId = getActorId(n);
              const actor = actorId ? actorProfiles[String(actorId)] : null;
              return (
                <View key={n.id} className="flex-row p-4 rounded-xl mb-3 border border-gray-100 bg-white items-start">
                  <View className="mr-3">
                    {actor ? (
                      <HistoryAvatar path={actor.avatar_url} size={44} />
                    ) : (
                      <View
                        className="w-11 h-11 rounded-full items-center justify-center"
                        style={{ backgroundColor: `${icon.color}18` }}
                      >
                        <IconSymbol name={icon.name} size={22} color={icon.color} />
                      </View>
                    )}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-bold text-base mb-0.5 text-gray-900">{n.title}</Text>
                    <Text className="text-gray-500 text-sm" numberOfLines={3}>
                      {n.body}
                    </Text>
                    <Text className="text-gray-400 text-[11px] mt-1.5">{new Date(n.created_at).toLocaleString()}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

