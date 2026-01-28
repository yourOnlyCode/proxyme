import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

type PastEvent = {
  source: 'club' | 'user';
  id: string;
  title: string;
  event_date: string;
  clubName?: string | null;
};

export default function PastEventsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PastEvent[]>([]);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data: clubRsvps } = await supabase
          .from('club_event_rsvps')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'going');

        const clubIds = Array.from(
          new Set(
            ((clubRsvps as any[]) || []).map((r) => String((r as any).event_id)).filter(Boolean)
          )
        );

        let clubEvents: PastEvent[] = [];
        if (clubIds.length > 0) {
          const primary = await supabase
            .from('club_events')
            .select('id, title, event_date, ends_at, club:clubs(name)')
            .in('id', clubIds)
            .eq('is_cancelled', false as any)
            .lt('ends_at', nowIso)
            .order('event_date', { ascending: false })
            .limit(100);

          let data: any[] = (primary.data as any[]) || [];
          const err: any = primary.error;
          if (err && err.code === '42703') {
            const fallback = await supabase
              .from('club_events')
              .select('id, title, event_date, club:clubs(name)')
              .in('id', clubIds)
              .eq('is_cancelled', false as any)
              .lt('event_date', nowIso)
              .order('event_date', { ascending: false })
              .limit(100);
            data = (fallback.data as any[]) || [];
          }
          clubEvents = data.map((e: any) => ({
            source: 'club',
            id: String(e.id),
            title: String(e.title),
            event_date: String(e.event_date),
            clubName: e?.club?.name ?? null,
          }));
        }

        const userRsvpsRes = await supabase
          .from('user_event_rsvps')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'going');

        const userIds =
          (userRsvpsRes as any)?.error?.code === '42P01'
            ? []
            : Array.from(
                new Set(
                  (((userRsvpsRes as any)?.data || []) as any[])
                    .map((r: any) => String(r?.event_id))
                    .filter(Boolean)
                )
              );

        let userEvents: PastEvent[] = [];
        if (userIds.length > 0) {
          const primary = await supabase
            .from('user_events')
            .select('id, title, event_date, ends_at, is_cancelled')
            .in('id', userIds)
            .eq('is_cancelled', false as any)
            .lt('ends_at', nowIso)
            .order('event_date', { ascending: false })
            .limit(100);

          let data: any[] = (primary.data as any[]) || [];
          const err: any = primary.error;
          if (err && err.code === '42703') {
            const fallback = await supabase
              .from('user_events')
              .select('id, title, event_date, is_cancelled')
              .in('id', userIds)
              .eq('is_cancelled', false as any)
              .lt('event_date', nowIso)
              .order('event_date', { ascending: false })
              .limit(100);
            data = (fallback.data as any[]) || [];
          }
          userEvents = data.map((e: any) => ({
            source: 'user',
            id: String(e.id),
            title: String(e.title),
            event_date: String(e.event_date),
          }));
        }

        const merged = [...clubEvents, ...userEvents].sort(
          (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
        );
        if (!cancelled) setEvents(merged);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, nowIso]);

  const titleStyle = { color: isDark ? '#E5E7EB' : undefined };
  const subStyle = { color: isDark ? 'rgba(226,232,240,0.65)' : undefined };

  return (
    <View className="flex-1" style={{ backgroundColor: isDark ? '#0B1220' : '#fff' }}>
      <View
        className="flex-row items-center border-b px-4"
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)',
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3 p-2"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconSymbol name="chevron.left" size={22} color={isDark ? '#E5E7EB' : '#111827'} />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1" style={titleStyle}>
          Events history
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator />
        </View>
      ) : events.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <IconSymbol name="calendar.badge.exclamationmark" size={40} color="#9CA3AF" />
          <Text className="text-gray-500 mt-4 font-semibold text-center" style={subStyle}>
            No past events yet
          </Text>
          <Text className="text-gray-400 text-sm mt-1 text-center" style={subStyle}>
            Events you attended will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => `${e.source}:${e.id}`}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item: e }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              className="rounded-2xl p-4 mb-3 border"
              style={{
                backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : '#f9fafb',
                borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(0,0,0,0.06)',
              }}
              onPress={() => router.push(`/events/${e.id}`)}
            >
              <View className="flex-row items-start">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: isDark ? 'rgba(71,85,105,0.5)' : '#e5e7eb' }}
                >
                  <IconSymbol name="calendar" size={18} color={isDark ? '#94A3B8' : '#111827'} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold" numberOfLines={1} style={titleStyle}>
                    {e.title}
                  </Text>
                  <Text className="text-xs mt-1" style={subStyle}>
                    {new Date(e.event_date).toLocaleString()}
                  </Text>
                  {e.source === 'club' && e.clubName ? (
                    <Text className="text-xs mt-1" style={subStyle}>
                      From {e.clubName}
                    </Text>
                  ) : e.source === 'user' ? (
                    <Text className="text-xs mt-1" style={subStyle}>
                      Personal event
                    </Text>
                  ) : null}
                </View>
                <IconSymbol name="chevron.right" size={18} color={isDark ? '#94A3B8' : '#9CA3AF'} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
