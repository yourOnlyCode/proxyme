import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchCrossedPaths, type CrossedPathRow } from '@/lib/crossedPaths';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProfileLite = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

type Group = {
  key: string;
  day_key: string;
  address_label: string | null;
  profiles: ProfileLite[];
};

function formatDayLabel(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Avatar({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
  }, [path]);

  return (
    <View style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: '#E5E7EB' }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <View className="w-full h-full items-center justify-center">
          <IconSymbol name="person.2.fill" size={22} color="#9CA3AF" />
        </View>
      )}
    </View>
  );
}

export default function CrossedPathsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<CrossedPathRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});

  // Swipe LEFT (from the right edge) to close. This avoids native-stack gestureDirection tweaks.
  const panResponder = useMemo(() => {
    const startRef = { x: null as number | null };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onPanResponderGrant: (evt) => {
        startRef.x = evt.nativeEvent.pageX;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const startX = startRef.x ?? evt.nativeEvent.pageX;
        const screenWidth = Dimensions.get('window').width || 0;
        const edgeZone = Math.min(140, screenWidth * 0.25);
        const isFromRightEdge = startX > screenWidth - edgeZone;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isLeftSwipe = gestureState.dx < -20;
        return isFromRightEdge && isHorizontal && isLeftSwipe;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const shouldClose = gestureState.dx < -70 || (gestureState.vx < -0.65 && gestureState.dx < -30);
        if (shouldClose) router.back();
        startRef.x = null;
      },
      onPanResponderTerminate: () => {
        startRef.x = null;
      },
    });
  }, [router]);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!user) return;
      setLoading(true);
      try {
        const { data: me } = await supabase.from('profiles').select('save_crossed_paths').eq('id', user.id).maybeSingle();
        const isEnabled = (me as any)?.save_crossed_paths ?? true;
        if (!mounted) return;
        setEnabled(isEnabled);
        if (!isEnabled) {
          setRows([]);
          setProfilesById({});
          return;
        }

        const r = await fetchCrossedPaths({ viewerId: user.id });
        if (!mounted) return;
        setRows(r);

        const ids = Array.from(new Set(r.map((x) => x.crossed_user_id).filter(Boolean)));
        if (ids.length === 0) {
          setProfilesById({});
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, is_verified')
          .in('id', ids);
        const map: Record<string, ProfileLite> = {};
        for (const p of (data as any[]) || []) {
          map[p.id] = p as ProfileLite;
        }
        if (!mounted) return;
        setProfilesById(map);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const groups: Group[] = useMemo(() => {
    const by = new Map<string, Group>();
    for (const r of rows) {
      const profile = profilesById[r.crossed_user_id];
      if (!profile) continue;
      // Dedupe: if the label is the same for the same day, treat it as one group even if address_key differs.
      const labelKey = (r.address_label || '').trim();
      const key = `${r.day_key}|${labelKey || r.address_key}`;
      const g = by.get(key) || { key, day_key: r.day_key, address_label: r.address_label ?? null, profiles: [] };
      if (!g.profiles.find((p) => p.id === profile.id)) g.profiles.push(profile);
      by.set(key, g);
    }
    // Hide empty groups (requirement #5)
    const list = Array.from(by.values()).filter((g) => g.profiles.length > 0);
    // Sort newest first
    list.sort((a, b) => (a.day_key < b.day_key ? 1 : a.day_key > b.day_key ? -1 : 0));
    return list;
  }, [rows, profilesById]);

  return (
    <View className="flex-1 bg-white" {...panResponder.panHandlers}>
      {/* Header */}
      <View
        className="px-4 pb-4 border-b border-gray-100 flex-row items-center"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="w-10 h-10" />
        <View className="w-10 h-10 ml-auto items-center justify-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <IconSymbol name="xmark" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 12,
            alignItems: 'center',
          }}
        >
          <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular' }}>
            Crossed Paths
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-gray-500 mt-3">Loading…</Text>
        </View>
      ) : !enabled ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="clock.arrow.circlepath" size={44} color="#9CA3AF" />
          <Text className="text-ink font-bold text-lg mt-4">Crossed Paths is off</Text>
          <Text className="text-gray-500 text-center mt-2">
            You can turn it back on in Settings → Edit Profile.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(settings)/profile')}
            className="mt-5 bg-black px-5 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="clock.arrow.circlepath" size={44} color="#9CA3AF" />
          <Text className="text-ink font-bold text-lg mt-4">No crossed paths yet</Text>
          <Text className="text-gray-500 text-center mt-2">
            When people show up in your Proxy feed at the same address, they’ll appear here for up to a week.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {groups.map((g) => (
            <View key={g.key} className="mb-6">
              <View className="flex-row items-baseline justify-between mb-3">
                <Text className="text-ink font-bold text-base flex-1 pr-2" numberOfLines={2}>
                  {g.address_label || 'A place you visited'}
                </Text>
                <Text className="text-gray-500 text-xs font-semibold">{formatDayLabel(g.day_key)}</Text>
              </View>
              <View className="flex-row flex-wrap">
                {g.profiles.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.85}
                    style={{ width: '33.33%', paddingRight: 10, paddingBottom: 14 }}
                    onPress={() => router.push(`/connections/${p.id}`)}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Avatar path={p.avatar_url} />
                      <Text className="text-[11px] text-gray-700 mt-2" numberOfLines={1}>
                        {p.full_name || p.username || 'User'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

