import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';
import { fetchCrossedPathGroups, fetchCrossedPathPeople, type CrossedPathGroup, type CrossedPathPerson } from '@/lib/crossedPaths';
import { reviewCrossedPathsGroups, reviewCrossedPathsPeopleByGroupKey } from '@/lib/reviewFixtures';
import { isReviewUser } from '@/lib/reviewMode';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type GroupState = {
  group: CrossedPathGroup;
  people: CrossedPathPerson[];
  cursor: { intent: number; match: number; seen_at: string; user_id: string } | null;
  hasMore: boolean;
  loadingMore: boolean;
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
    if (path.startsWith('http://') || path.startsWith('https://')) {
      setUrl(path);
      return;
    }
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

function intentColor(goal?: string | null) {
  switch (goal) {
    case 'Romance':
      return '#E11D48'; // tailwind romance
    case 'Friendship':
      return '#059669'; // tailwind friendship
    case 'Business':
      return '#2563EB'; // tailwind business
    default:
      return null;
  }
}

function AvatarWithIntentRing({ path, goal }: { path: string | null; goal?: string | null }) {
  const ring = intentColor(goal);
  return (
    <View
      style={{
        width: 70,
        height: 70,
        borderRadius: 35,
        padding: ring ? 3 : 0,
        backgroundColor: ring ? ring : 'transparent',
      }}
    >
      <Avatar path={path} />
    </View>
  );
}

export default function CrossedPathsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [proxyOn, setProxyOn] = useState(true);
  const [groups, setGroups] = useState<CrossedPathGroup[]>([]);
  const [groupStates, setGroupStates] = useState<Record<string, GroupState>>({});
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const BADGE_SEEN_KEY = 'crossedPaths:badgeSeenAt:v1';

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
    // Mark badge as "checked" when the user opens this screen.
    AsyncStorage.setItem(BADGE_SEEN_KEY, new Date().toISOString()).catch(() => {});
    async function run() {
      if (!user) return;
      setLoading(true);
      try {
        // App Store Review Mode: deterministic crossed paths without backend dependency.
        if (isReviewUser(user)) {
          if (!mounted) return;
          setEnabled(true);
          setProxyOn(true);
          const gs = [...reviewCrossedPathsGroups].map((g: any) => ({
            ...g,
            // CrossedPaths v2 uses place_key in the UI state key
            place_key: (g as any).address_key,
            last_seen: new Date().toISOString(),
          }));
          setGroups(gs as any);

          const initial: Record<string, GroupState> = {};
          for (const g of gs) {
            const key = `${g.day_key}|${g.place_key}`;
            const fixtureKey = `${g.day_key}::${g.place_key}`;
            const people = (reviewCrossedPathsPeopleByGroupKey[fixtureKey] || []) as any[];
            initial[key] = { group: g as any, people, cursor: null, hasMore: false, loadingMore: false };
          }
          setGroupStates(initial);
          return;
        }

        const { data: me } = await supabase
          .from('profiles')
          .select('save_crossed_paths, is_proxy_active')
          .eq('id', user.id)
          .maybeSingle();
        const isEnabled = (me as any)?.save_crossed_paths ?? true;
        const isProxyActive = (me as any)?.is_proxy_active ?? false;
        if (!mounted) return;
        setEnabled(isEnabled);
        setProxyOn(isProxyActive);
        // Only show/collect Crossed Paths when Proxy is ON and the user hasn't disabled the feature.
        if (!isEnabled || !isProxyActive) {
          setGroups([]);
          setGroupStates({});
          return;
        }

        const gs = await fetchCrossedPathGroups();
        if (!mounted) return;
        setGroups(gs);

        // Prime the first page for each group so the screen feels "filled" immediately.
        const initial: Record<string, GroupState> = {};
        for (const g of gs) {
          const key = `${g.day_key}|${g.place_key}`;
          initial[key] = { group: g, people: [], cursor: null, hasMore: true, loadingMore: false };
        }
        setGroupStates(initial);

        // Fetch the first batch for each group (sequential to avoid spiky load)
        for (const g of gs) {
          const key = `${g.day_key}|${g.place_key}`;
          const people = await fetchCrossedPathPeople({ day_key: g.day_key, place_key: g.place_key, limit: 12, cursor: null });
          const last = people.length ? people[people.length - 1] : null;
          if (!mounted) return;
          setGroupStates((prev) => ({
            ...prev,
            [key]: {
              group: g,
              people,
              cursor: last
                ? { intent: last.cursor_intent, match: last.cursor_match, seen_at: last.cursor_seen_at, user_id: last.cursor_user_id }
                : null,
              hasMore: people.length === 12,
              loadingMore: false,
            },
          }));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const groupList = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      if (a.day_key !== b.day_key) return a.day_key < b.day_key ? 1 : -1;
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });
    return list;
  }, [groups]);

  const loadMore = async (g: CrossedPathGroup) => {
    const key = `${g.day_key}|${g.place_key}`;
    const st = groupStates[key];
    if (!st || st.loadingMore || !st.hasMore) return;

    setGroupStates((prev) => ({
      ...prev,
      [key]: { ...prev[key]!, loadingMore: true },
    }));
    const next = await fetchCrossedPathPeople({ day_key: g.day_key, place_key: g.place_key, limit: 24, cursor: st.cursor });
    const last = next.length ? next[next.length - 1] : null;
    setGroupStates((prev) => {
      const current = prev[key];
      if (!current) return prev;
      const seen = new Set(current.people.map((p) => p.user_id));
      const merged = [...current.people, ...next.filter((p) => !seen.has(p.user_id))];
      return {
        ...prev,
        [key]: {
          ...current,
          people: merged,
          cursor: last
            ? { intent: last.cursor_intent, match: last.cursor_match, seen_at: last.cursor_seen_at, user_id: last.cursor_user_id }
            : current.cursor,
          hasMore: next.length === 24,
          loadingMore: false,
        },
      };
    });
  };

  return (
    <View className="flex-1 bg-white" style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }} {...panResponder.panHandlers}>
      <ProfileModal
        visible={profileVisible}
        profile={selectedProfile}
        onClose={() => setProfileVisible(false)}
      />
      {/* Header */}
      <View
        className="px-4 pb-4 border-b border-gray-100 flex-row items-center"
        style={{
          paddingTop: insets.top + 12,
          backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
          borderBottomColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
        }}
      >
        <View className="w-10 h-10" />
        <View className="w-10 h-10 ml-auto items-center justify-center">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <IconSymbol name="xmark" size={20} color={isDark ? '#E5E7EB' : '#111827'} />
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
          <Text className="text-xl text-ink" style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}>
            crossed paths
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="text-gray-500 mt-3" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>Loading…</Text>
        </View>
      ) : !enabled ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="clock.arrow.circlepath" size={44} color="#9CA3AF" />
          <Text className="text-ink font-bold text-lg mt-4" style={{ color: isDark ? '#E5E7EB' : undefined }}>Crossed Paths is off</Text>
          <Text className="text-gray-500 text-center mt-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
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
      ) : !proxyOn ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="location.slash.fill" size={44} color="#9CA3AF" />
          <Text className="text-ink font-bold text-lg mt-4" style={{ color: isDark ? '#E5E7EB' : undefined }}>Proxy is off</Text>
          <Text className="text-gray-500 text-center mt-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
            Turn on Proxy to collect and view Crossed Paths.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)')}
            className="mt-5 bg-black px-5 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">Go to Proxy</Text>
          </TouchableOpacity>
        </View>
      ) : groupList.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="clock.arrow.circlepath" size={44} color="#9CA3AF" />
          <Text className="text-ink font-bold text-lg mt-4" style={{ color: isDark ? '#E5E7EB' : undefined }}>No crossed paths yet</Text>
          <Text className="text-gray-500 text-center mt-2" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
            When people show up in your Proxy feed at the same address, they’ll appear here for up to a week.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {groupList.map((g) => {
            const key = `${g.day_key}|${g.place_key}`;
            const st = groupStates[key];
            const people = st?.people || [];
            return (
            <View key={key} className="mb-6">
              <View className="flex-row items-baseline justify-between mb-3">
                <Text className="text-ink font-bold text-[13px] flex-1 pr-2" numberOfLines={2} style={{ color: isDark ? '#E5E7EB' : undefined }}>
                  {g.address_label || 'A place you visited'}
                </Text>
                <Text className="text-gray-500 text-xs font-semibold" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
                  {formatDayLabel(g.day_key)}
                </Text>
              </View>
              <View className="flex-row flex-wrap">
                {people.map((p) => (
                  <TouchableOpacity
                    key={p.user_id}
                    activeOpacity={0.85}
                    style={{ width: '33.33%', paddingRight: 10, paddingBottom: 14 }}
                    onPress={() => {
                      // Open the same profile modal used across the app (not the connections route).
                      setSelectedProfile({
                        id: p.user_id,
                        username: p.username || 'user',
                        full_name: p.full_name || p.username || 'User',
                        bio: '',
                        avatar_url: p.avatar_url,
                        detailed_interests: null,
                        relationship_goals: null,
                        is_verified: !!p.is_verified,
                        city: undefined,
                        state: undefined,
                        social_links: undefined,
                        status_text: undefined,
                        status_image_url: undefined,
                        status_created_at: undefined,
                      });
                      setProfileVisible(true);
                    }}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <AvatarWithIntentRing path={p.avatar_url} goal={p.relationship_goals?.[0] ?? null} />
                      <Text className="text-[11px] text-gray-700 mt-2" numberOfLines={1} style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
                        {p.full_name || p.username || 'User'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              {st?.hasMore ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => loadMore(g)}
                  className="mt-1 self-center bg-gray-100 px-4 py-2 rounded-full border border-gray-200"
                  style={{
                    backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                    borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
                  }}
                  disabled={!!st.loadingMore}
                >
                  <Text className="text-gray-700 font-bold text-xs" style={{ color: isDark ? '#E5E7EB' : undefined }}>
                    {st.loadingMore ? 'Loading…' : 'View more'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );})}
        </ScrollView>
      )}
    </View>
  );
}

