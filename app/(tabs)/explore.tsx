import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Linking, PanResponder, Platform, Pressable, RefreshControl, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../lib/auth';
import { getReferralShareContent } from '../../lib/referral';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

const SOCIAL_PLATFORMS_MAP: Record<string, { lib: any, icon: string, color: string }> = {
    'instagram': { lib: FontAwesome, icon: 'instagram', color: '#E1306C' },
    'tiktok': { lib: FontAwesome5, icon: 'tiktok', color: '#000000' },
    'facebook': { lib: FontAwesome, icon: 'facebook-square', color: '#1877F2' },
    'linkedin': { lib: FontAwesome, icon: 'linkedin-square', color: '#0077B5' },
    'x': { lib: FontAwesome, icon: 'twitter', color: '#1DA1F2' },
};

type Photo = {
  url: string;
  order: number;
};

type SocialLinks = {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    linkedin?: string;
    x?: string;
};

type ProfileData = {
    username: string;
    full_name: string;
    bio: string;
    avatar_url: string | null;
    detailed_interests: Record<string, string[]> | null; 
    relationship_goals: string[] | null; 
    social_links: SocialLinks | null; 
    is_verified: boolean; 
    photos: Photo[] | null;
    friend_code?: string | null;
    referral_count?: number | null;
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Swipe left (from right edge) to open Settings
  const initialTouchX = useRef<number | null>(null);
  const settingsSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onPanResponderGrant: (evt) => {
        initialTouchX.current = evt.nativeEvent.pageX;
      },
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasEnoughMovement = Math.abs(gestureState.dx) > 20;
        return isHorizontal && hasEnoughMovement;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const startX = initialTouchX.current ?? evt.nativeEvent.pageX;
        const screenWidth = Dimensions.get('window').width || 0;
        const edgeZone = Math.min(140, screenWidth * 0.25);
        const isFromRightEdge = startX > screenWidth - edgeZone;

        const shouldOpen =
          isFromRightEdge && (gestureState.dx < -80 || (gestureState.vx < -0.65 && gestureState.dx < -30));

        if (shouldOpen) {
          router.push('/(settings)/edit-profile');
        }

        initialTouchX.current = null;
      },
      onPanResponderTerminate: () => {
        initialTouchX.current = null;
      },
    })
  ).current;

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
        .from('profiles')
        .select(`username, full_name, bio, avatar_url, detailed_interests, relationship_goals, social_links, is_verified, friend_code, referral_count`)
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        setLoading(false);
        return;
    }

    // If profile doesn't exist yet, redirect to onboarding
    if (!data) {
        console.log('Profile not found, redirecting to onboarding');
        router.replace('/onboarding');
        setLoading(false);
        return;
    }

    const { data: photosData } = await supabase
        .from('profile_photos')
        .select('image_url, display_order')
        .eq('user_id', user.id)
        .order('display_order');

    const { data: statsData } = await supabase.rpc('get_user_connection_stats', { target_user_id: user.id });
    if (statsData) setStats(statsData);

    setProfile({
        ...data,
        photos: (photosData || []).map(p => ({ url: p.image_url, order: p.display_order }))
    });
    setLoading(false);
  };

  useFocusEffect(
      useCallback(() => {
          fetchProfile();
      }, [user])
  );


  // Get share content with clickable links - using centralized function
  const getShareContent = () => {
    return getReferralShareContent(profile?.friend_code || null);
  };

  const handleCopyFriendCode = async () => {
    if (!profile?.friend_code) return;
    
    try {
      await Clipboard.setStringAsync(profile.friend_code);
      toast.show(`Friend code ${profile.friend_code} copied to clipboard!`, 'success');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.show('Failed to copy friend code', 'error');
    }
  };

  const handleShareFriendCode = async () => {
    const content = getShareContent();
    if (!content) return;
    
    try {
      await Share.share({
        message: content.shareText,
        title: 'Join me on Proxyme!',
        url: content.appStoreLink, // iOS will use this for better sharing
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };


  const openLink = (url: string) => {
      Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const getSocialUrl = (platform: string, handle: string) => {
      if (handle.startsWith('http')) return handle;
      switch (platform) {
          case 'instagram': return `https://instagram.com/${handle.replace('@', '')}`;
          case 'tiktok': return `https://tiktok.com/@${handle.replace('@', '')}`;
          case 'x': return `https://x.com/${handle.replace('@', '')}`;
          default: return handle;
      }
  };

  const getTheme = (goal?: string) => {
      switch(goal) {
          case 'Romance': return { bg: 'bg-romance/10', text: 'text-romance', border: 'border-romance/30', badge: 'bg-romance/20', icon: '#E07A5F' };
          case 'Friendship': return { bg: 'bg-friendship/10', text: 'text-friendship', border: 'border-friendship/30', badge: 'bg-friendship/20', icon: '#81B29A' };
          case 'Professional': return { bg: 'bg-business/10', text: 'text-business', border: 'border-business/30', badge: 'bg-business/20', icon: '#3D405B' };
          default: return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', badge: 'bg-slate-200', icon: '#718096' };
      }
  };

  const primaryGoal = profile?.relationship_goals?.[0];
  const theme = getTheme(primaryGoal);

  const intentMeta = useMemo(() => {
    const goal = primaryGoal;
    if (!goal) return null;
    if (goal === 'Romance') return { icon: 'heart.fill', label: 'Romance', pillBg: 'bg-romance/15', pillText: 'text-romance' };
    if (goal === 'Friendship') return { icon: 'person.2.fill', label: 'Friendship', pillBg: 'bg-friendship/15', pillText: 'text-friendship' };
    if (goal === 'Professional') return { icon: 'briefcase.fill', label: 'Professional', pillBg: 'bg-business/15', pillText: 'text-business' };
    return { icon: 'sparkles', label: goal, pillBg: 'bg-slate-100', pillText: 'text-slate-700' };
  }, [primaryGoal]);

  const [hoverPhotoIdx, setHoverPhotoIdx] = useState<number | null>(null);

  // Hooks must run on every render (no early returns before this point).
  if (!profile && loading) return <View className="flex-1 bg-transparent" />;
  if (!profile) return <View className="flex-1 bg-transparent" />;

  return (
    <View className="flex-1 bg-transparent" {...settingsSwipeResponder.panHandlers}>
        <ScrollView 
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchProfile} />}
            contentContainerStyle={{ paddingBottom: 140 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
        >
            {/* Header / Cover Area - Taller */}
            <View className={`h-80 relative ${theme.bg}`}>
                {profile?.photos && profile.photos.length > 0 ? (
                    <ProfileImage path={profile.photos[0].url} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <View className="w-full h-full items-center justify-center">
                        <IconSymbol name="camera.fill" size={48} color={theme.icon} />
                    </View>
                )}

                {/* Settings Button (back in banner) */}
                <TouchableOpacity 
                    className="absolute top-12 right-4 bg-paper/90 p-2 rounded-full shadow-sm backdrop-blur-md"
                    onPress={() => router.push('/(settings)/edit-profile')}
                    activeOpacity={0.85}
                >
                     <IconSymbol name="gearshape.fill" size={22} color="#1A1A1A" />
                </TouchableOpacity>
                
            </View>

            {/* Profile Info */}
            <View className="px-5 -mt-16">
                {/* Profile Photo Circle with Apple Glass Morphism - Centered horizontally */}
                <View className="items-center mb-4">
                  <View
                    style={{
                      width: 144,
                      height: 144,
                      borderRadius: 72,
                      overflow: 'hidden',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.25,
                      shadowRadius: 24,
                      elevation: 20,
                    }}
                  >
                    {/* Blur Background - Apple Style Glass */}
                    <BlurView
                      intensity={80}
                      tint="light"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: 72,
                      }}
                    />
                    {/* Subtle gradient overlay for glass effect */}
                    <LinearGradient
                      colors={[
                        'rgba(255, 255, 255, 0.25)',
                        'rgba(255, 255, 255, 0.1)',
                        'rgba(255, 255, 255, 0.05)',
                        'rgba(255, 255, 255, 0.1)',
                        'rgba(255, 255, 255, 0.25)',
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      locations={[0, 0.3, 0.5, 0.7, 1]}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: 72,
                      }}
                    />
                    {/* Subtle border */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: 72,
                        borderWidth: 1.5,
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                      }}
                    />
                    {/* Profile Image Container with inset */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        right: 4,
                        bottom: 4,
                        borderRadius: 68,
                        overflow: 'hidden',
                      }}
                    >
                      <ProfileImage path={profile?.avatar_url || null} style={{ width: '100%', height: '100%' }} />
                    </View>
                  </View>
                </View>
                
                <View className="mt-4 items-center">
                    <View className="flex-row items-center justify-center flex-wrap">
                        <Text className="text-3xl font-extrabold text-slate-900 mr-2 text-center">{profile?.full_name || 'No Name'}</Text>
                        {profile?.is_verified && (
                            <IconSymbol
                              name="checkmark.seal.fill"
                              size={24}
                              color={(profile.referral_count || 0) >= 10 ? '#7C3AED' : '#3B82F6'}
                            />
                        )}
                    </View>
                    <View className="flex-row items-center justify-center mt-1 flex-wrap">
                        <Text className={`text-base font-semibold ${theme.text} opacity-80 text-center`}>@{profile?.username || 'username'}</Text>
                        {stats && stats.total > 0 && (
                            <>
                                <Text className={`text-base font-semibold ${theme.text} opacity-60 mx-2`}>•</Text>
                                <Pressable
                                  onPress={() => {
                                    if (user?.id) router.push(`/connections/${user.id}`);
                                  }}
                                >
                                  <View className="flex-row items-center">
                                    <Text className={`text-base font-semibold ${theme.text} opacity-80 text-center`}>
                                        {stats.total} {stats.total === 1 ? 'connection' : 'connections'}
                                    </Text>
                                    <View className="ml-2 opacity-60">
                                      <IconSymbol name="chevron.right" size={16} color="#64748B" />
                                    </View>
                                  </View>
                                </Pressable>
                            </>
                        )}
                    </View>

                    {/* Intent pill (no label) */}
                    {!!intentMeta && (
                      <View className="mt-3">
                        <Pressable onPress={() => router.push('/(settings)/edit-profile')}>
                          <View className={`flex-row items-center px-4 py-2 rounded-full ${intentMeta.pillBg}`}>
                            <IconSymbol name={intentMeta.icon as any} size={14} color={intentMeta.label === 'Romance' ? '#E11D48' : intentMeta.label === 'Friendship' ? '#059669' : intentMeta.label === 'Professional' ? '#2563EB' : '#334155'} />
                            <Text className={`ml-2 font-bold ${intentMeta.pillText}`}>{intentMeta.label}</Text>
                            <View className="ml-2 opacity-60">
                              <IconSymbol name="pencil" size={12} color="#64748B" />
                            </View>
                          </View>
                        </Pressable>
                      </View>
                    )}

                    {/* Social links (wrapped row) */}
                    {profile?.social_links && Object.keys(profile.social_links).length > 0 && (
                      <View className="mt-3 px-2">
                        <View className="flex-row flex-wrap justify-center">
                          {Object.entries(profile.social_links).map(([platform, handle]) => {
                            if (!handle) return null;
                            const cfg = SOCIAL_PLATFORMS_MAP[platform];
                            if (!cfg) return null;
                            const IconComp = cfg.lib;
                            const url = getSocialUrl(platform, String(handle));

                            return (
                              <TouchableOpacity
                                key={platform}
                                onPress={() => openLink(url)}
                                activeOpacity={0.9}
                                className="mr-2 mb-2"
                                style={{
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: 'rgba(148,163,184,0.25)',
                                  backgroundColor: 'rgba(255,255,255,0.65)',
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 6 },
                                  shadowOpacity: 0.08,
                                  shadowRadius: 12,
                                  elevation: 4,
                                }}
                              >
                                <View className="flex-row items-center">
                                  <IconComp name={cfg.icon as any} size={14} color={cfg.color} />
                                  <Text className="ml-2 text-slate-700 font-semibold text-xs">
                                    {String(handle).startsWith('http') ? platform : String(handle)}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                </View>

                {/* Friend Code Section */}
                {profile?.friend_code && (
                    <GlassCard className="mt-4" contentClassName="p-3" tint="light" intensity={18}>
                        <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center flex-1">
                                <IconSymbol name="gift.fill" size={14} color="#3B82F6" />
                                <Text className="text-slate-700 font-semibold text-xs ml-2">Friend Code: {profile.friend_code}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleShareFriendCode}
                                className="bg-ink px-2 py-1 rounded"
                            >
                                <IconSymbol name="paperplane.fill" size={12} color="white" />
                            </TouchableOpacity>
                        </View>
                        {profile.referral_count !== undefined && profile.referral_count !== null && (
                            <View className="flex-row items-center mt-1">
                                {profile.referral_count >= 3 ? (
                                  <>
                                    <View className="bg-purple-100 px-2 py-1 rounded-full">
                                      <Text className="text-purple-700 font-bold text-xs">
                                        {Math.min(profile.referral_count, 10)} / 10 super user
                                      </Text>
                                    </View>
                                    <Text className="text-slate-600 text-xs ml-2">
                                      {profile.referral_count >= 10 ? '✓ Purple check unlocked' : `${10 - profile.referral_count} more to level up!`}
                                    </Text>
                                  </>
                                ) : (
                                  <>
                                    <View className="bg-blue-100 px-2 py-1 rounded-full">
                                      <Text className="text-blue-700 font-bold text-xs">
                                        {profile.referral_count} / 3 referrals
                                      </Text>
                                    </View>
                                    <Text className="text-slate-600 text-xs ml-2">
                                      {`${3 - profile.referral_count} more for verification`}
                                    </Text>
                                  </>
                                )}
                            </View>
                        )}
                    </GlassCard>
                )}

                {/* (Intent moved under username) */}

                {/* Bio */}
                {profile?.bio && (
                    <Pressable onPress={() => router.push('/(settings)/edit-profile')} style={({ pressed }) => ({
                      opacity: pressed ? 0.75 : 1,
                    })}>
                      <Text className="mt-6 text-slate-900 text-lg leading-7 font-medium opacity-90">
                          {profile.bio}
                      </Text>
                    </Pressable>
                )}

                {/* Detailed Interests */}
                <View className="mt-8">
                    <View className="flex-row items-center justify-between mb-4">
                      <Text className="text-2xl font-bold text-slate-900">Interests</Text>
                      <View className="flex-row items-center">
                        <IconSymbol name="sparkles" size={16} color="#94A3B8" />
                      </View>
                    </View>

                    {profile?.detailed_interests && Object.keys(profile.detailed_interests).length > 0 ? (
                      <>
                        {/* Full-width silver strip behind interests carousel */}
                        <View className="-mx-5 bg-slate-100/80 py-5 border-y border-slate-200/70">
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingRight: 20 }}
                            nestedScrollEnabled
                          >
                            {Object.entries(profile.detailed_interests).map(([category, items]) => {
                              const safeItems = (items || []).filter(Boolean).slice(0, 4);
                              return (
                                <Pressable
                                  key={category}
                                  onPress={() => router.push('/(settings)/edit-interests')}
                                  style={{
                                    width: 260,
                                    marginRight: 16,
                                    borderRadius: 22,
                                    overflow: 'hidden',
                                    backgroundColor: 'rgba(255,255,255,0.75)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(148,163,184,0.25)',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 14 },
                                    shadowOpacity: 0.14,
                                    shadowRadius: 24,
                                    elevation: 14,
                                  }}
                                >
                                  <View className="p-4">
                                    <View className="flex-row items-center justify-between">
                                      <Text className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                                        {category}
                                      </Text>
                                      <IconSymbol name="pencil" size={14} color="#94A3B8" />
                                    </View>
                                    <View className="mt-3 flex-row flex-wrap">
                                      {safeItems.length > 0 ? (
                                        safeItems.map((item, idx) => (
                                          <View
                                            key={`${category}-${idx}`}
                                            className={`px-3 py-1.5 rounded-lg mr-2 mb-2 ${theme.bg}`}
                                            style={{
                                              borderWidth: 1,
                                              borderColor: 'rgba(148,163,184,0.18)',
                                            }}
                                          >
                                            <Text className={`font-semibold text-sm ${theme.text}`}>{item}</Text>
                                          </View>
                                        ))
                                      ) : (
                                        <Text className="text-slate-400 italic text-sm">General Interest</Text>
                                      )}
                                    </View>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </View>
                      </>
                    ) : (
                      <View className="-mx-5 bg-slate-100/80 py-5 border-y border-slate-200/70">
                        <View className="px-5">
                          <GlassCard contentClassName="p-6 items-center" tint="light" intensity={14}>
                            <Text className="text-slate-400 italic">No interests added yet.</Text>
                          </GlassCard>
                        </View>
                      </View>
                    )}
                </View>

                {/* Spacer (no divider line) */}
                <View className="mt-8" />

                {/* Photos Gallery */}
                {profile?.photos && profile.photos.length > 0 && (
                    <View>
                        <Text className="text-2xl font-bold mb-4 text-slate-900">Photos</Text>

                        {/* Full-width "silver" strip behind the carousel */}
                        <View className="-mx-5 bg-slate-100/80 py-5 border-y border-slate-200/70">
                          <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingHorizontal: 20, paddingRight: 20 }}
                              nestedScrollEnabled
                          >
                              {profile.photos.map((p, i) => {
                                const isHovered = Platform.OS === 'web' && hoverPhotoIdx === i;
                                return (
                                  <Pressable
                                    key={i}
                                    onHoverIn={() => setHoverPhotoIdx(i)}
                                    onHoverOut={() => setHoverPhotoIdx(null)}
                                    onPress={() => router.push('/(settings)/edit-profile')}
                                    style={({ pressed }) => ({
                                      width: 200,
                                      height: 250,
                                      marginRight: 16,
                                      borderRadius: 20,
                                      overflow: 'hidden',
                                      backgroundColor: '#E2E8F0',
                                      borderWidth: 1,
                                      borderColor: 'rgba(148,163,184,0.35)',
                                      transform: [
                                        { translateY: pressed ? 2 : isHovered ? -4 : 0 },
                                        { scale: pressed ? 0.99 : isHovered ? 1.02 : 1 },
                                      ],
                                      shadowColor: '#000',
                                      shadowOffset: { width: 0, height: pressed ? 8 : 14 },
                                      shadowOpacity: pressed ? 0.16 : isHovered ? 0.24 : 0.18,
                                      shadowRadius: pressed ? 14 : 24,
                                      elevation: pressed ? 8 : 14,
                                    })}
                                  >
                                      <ProfileImage path={p.url} style={{ width: 200, height: 250 }} />
                                  </Pressable>
                                );
                              })}
                          </ScrollView>
                        </View>
                    </View>
                )}

            </View>
        </ScrollView>
    </View>
  );
}

function ProfileImage({ path, style }: { path: string | null, style: any }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) {
        setUrl(null);
        return;
      }

      // If we already stored a full URL in the DB, use it directly.
      if (path.startsWith('http://') || path.startsWith('https://')) {
        setUrl(path);
        return;
      }

      // Handle older formats that may include "public/avatars/..."
      const cleaned = path.includes('public/avatars/') ? path.split('public/avatars/')[1] : path;
      const { data } = supabase.storage.from('avatars').getPublicUrl(cleaned);
      setUrl(data?.publicUrl ?? null);
    }, [path]);
  
    if (!url) return <View style={style} className="bg-slate-200 animate-pulse" />;
  
    return (
      <Image source={{ uri: url }} style={style} resizeMode="cover" />
    );
}
