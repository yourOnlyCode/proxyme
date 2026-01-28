import { IconSymbol } from '@/components/ui/icon-symbol';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type AttendedEvent = {
  source: 'club' | 'user';
  id: string;
  title: string;
  event_date: string;
  clubName?: string | null;
};

export function AttendedEvents({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AttendedEvent[]>([]);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      setLoading(true);
      try {
        // Club events attended (going)
        const { data: clubRsvps } = await supabase
          .from('club_event_rsvps')
          .select('event_id')
          .eq('user_id', userId)
          .eq('status', 'going');

        const clubIds = Array.from(new Set(((clubRsvps as any[]) || []).map((r) => String((r as any).event_id)).filter(Boolean)));

        let clubEvents: AttendedEvent[] = [];
        if (clubIds.length > 0) {
          // Prefer ends_at (duration-aware). Fallback to event_date if schema not upgraded.
          const primary = await supabase
            .from('club_events')
            .select('id, title, event_date, ends_at, club:clubs(name)')
            .in('id', clubIds)
            .eq('is_cancelled', false as any)
            .lt('ends_at', nowIso)
            .order('event_date', { ascending: false })
            .limit(12);

          let data: any[] = (primary.data as any[]) || [];
          let err: any = primary.error;

          if (err && err.code === '42703') {
            const fallback = await supabase
              .from('club_events')
              .select('id, title, event_date, club:clubs(name)')
              .in('id', clubIds)
              .eq('is_cancelled', false as any)
              .lt('event_date', nowIso)
              .order('event_date', { ascending: false })
              .limit(12);
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

        // User events attended (going)
        const userRsvpsRes = await supabase
          .from('user_event_rsvps')
          .select('event_id')
          .eq('user_id', userId)
          .eq('status', 'going');

        const userIds = (userRsvpsRes as any)?.error?.code === '42P01'
          ? []
          : Array.from(new Set((((userRsvpsRes as any)?.data || []) as any[]).map((r: any) => String(r?.event_id)).filter(Boolean)));

        let userEvents: AttendedEvent[] = [];
        if (userIds.length > 0) {
          const primary = await supabase
            .from('user_events')
            .select('id, title, event_date, ends_at, is_cancelled')
            .in('id', userIds)
            .eq('is_cancelled', false as any)
            .lt('ends_at', nowIso)
            .order('event_date', { ascending: false })
            .limit(12);

          let data: any[] = (primary.data as any[]) || [];
          let err: any = primary.error;
          if (err && err.code === '42703') {
            const fallback = await supabase
              .from('user_events')
              .select('id, title, event_date, is_cancelled')
              .in('id', userIds)
              .eq('is_cancelled', false as any)
              .lt('event_date', nowIso)
              .order('event_date', { ascending: false })
              .limit(12);
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
          (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
        );

        if (!cancelled) setEvents(merged.slice(0, 10));
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, nowIso]);

  return (
    <View className="mt-6 px-4">
      <Text className="text-ink font-bold text-lg">Attended events</Text>
      <Text className="text-gray-400 text-xs mt-1">Events you’ve attended (based on RSVPs).</Text>

      {loading ? (
        <View className="py-6 items-center">
          <ActivityIndicator />
        </View>
      ) : events.length === 0 ? (
        <View className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <Text className="text-gray-500 text-sm">No attended events yet.</Text>
        </View>
      ) : (
        <View className="mt-3">
          {events.map((e) => (
            <TouchableOpacity
              key={`${e.source}:${e.id}`}
              activeOpacity={0.85}
              className="bg-white border border-gray-200 rounded-2xl p-4 mb-3"
              onPress={() => router.push(`/events/${e.id}`)}
            >
              <View className="flex-row items-start">
                <View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center mr-3">
                  <IconSymbol name="calendar" size={18} color="#111827" />
                </View>
                <View className="flex-1">
                  <Text className="text-ink font-bold" numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text className="text-gray-500 text-xs mt-1">{new Date(e.event_date).toLocaleString()}</Text>
                  {e.source === 'club' && e.clubName ? (
                    <Text className="text-gray-400 text-xs mt-1">From {e.clubName}</Text>
                  ) : e.source === 'user' ? (
                    <Text className="text-gray-400 text-xs mt-1">Personal event</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

