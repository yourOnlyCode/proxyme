import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { AccountCheckBadge } from '@/components/profile/AccountCheckBadge';
import { useConnectionState } from '@/hooks/useConnectionState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Linking, Modal, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { showSafetyOptions } from '../lib/safety';
import { supabase } from '../lib/supabase';
import { calculateMatchPercentage as calculateMatchPercentageShared } from '../lib/match';

const { width, height } = Dimensions.get('window');

// Compatible with FeedProfile
export type ProfileData = {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string | null;
  dist_meters?: number;
  photos?: { url: string; order: number }[] | null;
  detailed_interests: Record<string, string[]> | null;
  relationship_goals: string[] | null;
  is_verified: boolean;
  referral_count?: number | null;
  share_count?: number | null;
  shared_interests_count?: number;
  city?: string;
  state?: string;
  social_links?: any;
  status_text?: string | null;
  status_image_url?: string | null;
  status_created_at?: string | null; // NEW
  connection_id?: string | null;
  has_sent_interest?: boolean;
  has_received_interest?: boolean;
};

type ProfileModalProps = {
  visible: boolean;
  profile: ProfileData | null;
  onClose: () => void;
  myInterests?: Record<string, string[]> | null;
  myGoals?: string[] | null;
  onStateChange?: () => void; // Callback when connection state changes
};

export function ProfileModal({ 
    visible, 
    profile, 
    onClose, 
    myInterests,
    myGoals,
    onStateChange,
}: ProfileModalProps) {
    const { user } = useAuth();
    const router = useRouter();
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number, hidden?: boolean } | null>(null);
    const [fetchedPhotos, setFetchedPhotos] = useState<{ url: string; order: number }[] | null>(null);
    const [fetchedProfile, setFetchedProfile] = useState<Partial<ProfileData> | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [fullScreenVisible, setFullScreenVisible] = useState(false);
    const [fullScreenIndex, setFullScreenIndex] = useState(0);
    const fullScreenScrollRef = useRef<ScrollView>(null);
    const scrollTopRef = useRef(0);
    const swipeY = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (!visible) swipeY.setValue(0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const swipeDownResponder = useMemo(() => {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          if (!visible) return false;
          if (fullScreenVisible) return false;
          // Only allow swipe-to-close when scrolled to top (prevents fighting the ScrollView).
          if (scrollTopRef.current > 6) return false;
          const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
          const isDown = gestureState.dy > 10;
          return isVertical && isDown;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const dy = Math.max(0, gestureState.dy);
          swipeY.setValue(dy);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const shouldClose = gestureState.dy > 90 || (gestureState.vy > 0.85 && gestureState.dy > 40);
          if (shouldClose) {
            onClose();
            swipeY.setValue(0);
            return;
          }
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: true }).start();
        },
      });
    }, [visible, fullScreenVisible, onClose, swipeY]);

    // Scroll to correct photo when full-screen opens
    useEffect(() => {
        if (fullScreenVisible && fullScreenScrollRef.current) {
            setTimeout(() => {
                fullScreenScrollRef.current?.scrollTo({
                    x: fullScreenIndex * width,
                    animated: false
                });
            }, 100);
        }
    }, [fullScreenVisible, fullScreenIndex]);

    useEffect(() => {
        if (profile?.id && visible) {
            setFetchedProfile(null);
            setLoadingProfile(true);

            // App Store Review Mode: fixture profiles use local IDs and may not exist in Supabase.
            // If the caller provided full data, skip remote fetches to avoid 500s/crashes.
            if (String(profile.id).startsWith('review-')) {
                setFetchedPhotos(profile.photos || null);
                setLoadingProfile(false);
                return;
            }

            supabase.rpc('get_user_connection_stats', { target_user_id: profile.id })
                .then(({ data, error }) => {
                    if (data) setStats(data);
                });

            // Fetch Photos
            supabase
                .from('profile_photos')
                .select('image_url, display_order')
                .eq('user_id', profile.id)
                .order('display_order')
                .then(({ data }) => {
                    if (data) {
                        setFetchedPhotos(data.map(p => ({ url: p.image_url, order: p.display_order })));
                    }
                });

            // Fetch full profile details (especially `detailed_interests`) so the modal
            // is consistent even when upstream screens pass a "thin" profile object.
            supabase
                .from('profiles')
                .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, referral_count, share_count, city, state, social_links, status_text, status_image_url, status_created_at')
                .eq('id', profile.id)
                .single()
                .then(({ data }) => {
                    if (data) setFetchedProfile(data);
                })
                .finally(() => setLoadingProfile(false));
        } else {
            setFetchedPhotos(null);
            setFetchedProfile(null);
            setLoadingProfile(false);
        }
    }, [profile?.id, visible]);

    // Use connection state hook - MUST be called before any early returns
    const connectionState = useConnectionState(profile);
    const isTrulyConnected = connectionState.state === 'already_connected';

    if (!profile) return null;

    const mergedProfile: ProfileData = {
        ...profile,
        ...(fetchedProfile || {}),
        detailed_interests: (fetchedProfile as any)?.detailed_interests ?? profile.detailed_interests,
        relationship_goals: (fetchedProfile as any)?.relationship_goals ?? profile.relationship_goals,
        bio: (fetchedProfile as any)?.bio ?? profile.bio,
        social_links: (fetchedProfile as any)?.social_links ?? profile.social_links,
        avatar_url: (fetchedProfile as any)?.avatar_url ?? profile.avatar_url,
        full_name: (fetchedProfile as any)?.full_name ?? profile.full_name,
        username: (fetchedProfile as any)?.username ?? profile.username,
        is_verified: (fetchedProfile as any)?.is_verified ?? profile.is_verified,
        referral_count: (fetchedProfile as any)?.referral_count ?? (profile as any).referral_count,
        share_count: (fetchedProfile as any)?.share_count ?? (profile as any).share_count,
        city: (fetchedProfile as any)?.city ?? profile.city,
        state: (fetchedProfile as any)?.state ?? profile.state,
        status_text: (fetchedProfile as any)?.status_text ?? profile.status_text,
        status_image_url: (fetchedProfile as any)?.status_image_url ?? profile.status_image_url,
        status_created_at: (fetchedProfile as any)?.status_created_at ?? profile.status_created_at,
    };
    
    const getGoalColors = (goal?: string) => {
        switch(goal) {
            case 'Romance': return { bg: 'bg-romance/5', border: 'border-romance/30', text: 'text-romance', badgeBg: 'bg-romance/10' };
            case 'Friendship': return { bg: 'bg-friendship/5', border: 'border-friendship/30', text: 'text-friendship', badgeBg: 'bg-friendship/10' };
            case 'Business': return { bg: 'bg-business/5', border: 'border-business/30', text: 'text-business', badgeBg: 'bg-business/10' };
            default: return { bg: 'bg-white', border: 'border-gray-200', text: 'text-ink', badgeBg: 'bg-gray-100' };
        }
    };

    const primaryGoal = mergedProfile.relationship_goals?.[0];
    const colors = getGoalColors(primaryGoal);

    // Calculate Shared Interests Score & Percentage locally
    let sharedScore = 0;
    const allInterests: { category: string, value: string, isShared: boolean }[] = [];
    
    if (mergedProfile.detailed_interests) {
        Object.entries(mergedProfile.detailed_interests).forEach(([cat, values]) => {
            let catMatch = false;
            if (myInterests && myInterests[cat]) {
                catMatch = true;
                sharedScore += 1;
            }

            if (values && values.length > 0) {
                 values.forEach(val => {
                     let isShared = false;
                     // Check if I have this exact interest
                     if (myInterests && myInterests[cat]) {
                         const myValues = myInterests[cat];
                         if (myValues.some(mv => mv.toLowerCase().trim() === val.toLowerCase().trim())) {
                             isShared = true;
                             sharedScore += 5;
                         }
                     }
                     allInterests.push({ category: cat, value: val, isShared });
                 });
            } else {
                 allInterests.push({ category: cat, value: '', isShared: catMatch });
            }
        });
    }

    const matchPercentage = calculateMatchPercentageShared(myInterests, mergedProfile.detailed_interests);

    // Prepare Photos
    const galleryPhotos = fetchedPhotos || mergedProfile.photos || [];
    const displayPhotos: { url: string }[] = [];
    if (mergedProfile.avatar_url) displayPhotos.push({ url: mergedProfile.avatar_url });
    galleryPhotos.forEach(p => displayPhotos.push({ url: p.url }));
    
    // Ensure at least one item for rendering if everything is missing
    if (displayPhotos.length === 0) displayPhotos.push({ url: '' });

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
            presentationStyle="pageSheet" // Nice card effect on iOS
        >
            <Animated.View
              className="flex-1 bg-white"
              style={{ backgroundColor: isDark ? '#0B1220' : '#FFFFFF', transform: [{ translateY: swipeY }] }}
              {...swipeDownResponder.panHandlers}
            >
                 <ScrollView
                   className="flex-1"
                   contentContainerStyle={{ paddingBottom: 100 }}
                   scrollEventThrottle={16}
                   onScroll={(e) => {
                     scrollTopRef.current = e.nativeEvent.contentOffset.y || 0;
                   }}
                 >
                    {/* Header Image - Much Taller */}
                    <View className="w-full h-[600px] bg-gray-200 relative">
                        {displayPhotos.length > 1 ? (
                            <ScrollView 
                                horizontal 
                                pagingEnabled 
                                showsHorizontalScrollIndicator={false}
                                className="w-full h-full"
                            >
                                {displayPhotos.map((photo, index) => (
                                    <TouchableOpacity 
                                        key={index} 
                                        activeOpacity={1}
                                        onPress={() => {
                                            setFullScreenIndex(index);
                                            setFullScreenVisible(true);
                                        }}
                                        style={{ width: width, height: 600 }}
                                    >
                                        <ProfileImage path={photo.url} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <TouchableOpacity 
                                activeOpacity={1}
                                onPress={() => {
                                    setFullScreenIndex(0);
                                    setFullScreenVisible(true);
                                }}
                                style={{ width: width, height: 600 }}
                            >
                                <ProfileImage path={displayPhotos[0].url} />
                            </TouchableOpacity>
                        )}
                        
                        {/* Overflow Menu (Report / Block) */}
                        {user?.id && mergedProfile?.id && user.id !== mergedProfile.id ? (
                          <TouchableOpacity
                            onPress={() => {
                              showSafetyOptions(user.id, mergedProfile.id, () => {
                                // Hide immediately + refresh parent screens
                                onStateChange?.();
                                onClose();
                              });
                            }}
                            className="absolute top-12 right-14 bg-black/30 p-2 rounded-full backdrop-blur-md"
                            accessibilityRole="button"
                            accessibilityLabel="More options"
                          >
                            <IconSymbol name="ellipsis" size={18} color="white" />
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity 
                            onPress={onClose}
                            className="absolute top-12 right-4 bg-black/30 p-2 rounded-full backdrop-blur-md"
                        >
                            <IconSymbol name="xmark" size={20} color="white" />
                        </TouchableOpacity>
                        
                        {/* Page Indicator for Carousel */}
                        {displayPhotos.length > 1 && (
                            <View className="absolute bottom-14 left-0 right-0 flex-row justify-center space-x-2">
                                {displayPhotos.map((_, i) => (
                                    <View key={i} className="w-2 h-2 rounded-full bg-white/50" />
                                ))}
                            </View>
                        )}
                    </View>

                    <View
                      className="px-6 -mt-10 pt-4 bg-white rounded-t-3xl shadow-lg"
                      style={{
                        backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
                        shadowColor: '#000',
                        shadowOpacity: isDark ? 0.35 : 0.18,
                      }}
                    >
                        {/* Name */}
                        <View className="items-center mb-2">
                          <View className="flex-row items-center">
                            <Text
                              className="text-[22px] font-extrabold text-ink"
                              style={{ color: isDark ? '#E5E7EB' : undefined, textAlign: 'center' }}
                              numberOfLines={1}
                            >
                              {mergedProfile.full_name}
                            </Text>
                        <View className="ml-2">
                          <AccountCheckBadge
                            shareCount={mergedProfile.share_count}
                            referralCount={mergedProfile.referral_count}
                            size={18}
                          />
                        </View>
                          </View>
                          <Text className="text-gray-500 font-medium text-[13px] mt-1">@{mergedProfile.username}</Text>
                          <View className="mt-2">
                            <SocialIcons links={mergedProfile.social_links} />
                          </View>
                          {!isTrulyConnected && connectionState.state === 'interest_declined' ? (
                            <View className="mt-3 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200">
                              <Text className="text-[11px] font-bold text-orange-700">Previously declined your interest</Text>
                            </View>
                          ) : null}
                          {matchPercentage > 0 ? (
                            <View className="mt-3 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                              <Text className="text-[11px] font-extrabold text-emerald-700">{matchPercentage}% match</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Connection Stats */}
                        {stats && stats.total > 0 && (
                            <TouchableOpacity 
                                activeOpacity={stats.hidden ? 1 : 0.7}
                                onPress={() => {
                                    if (stats.hidden) {
                                        Alert.alert('Private', 'This user has hidden their connections.');
                                    } else {
                                        onClose();
                                        router.push(`/connections/${profile.id}`);
                                    }
                                }}
                                className="flex-row mb-6 bg-gray-50 p-3 rounded-xl justify-between border border-gray-100 relative"
                                style={{
                                  backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                                  borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
                                }}
                            >
                                <View className="items-center flex-1 justify-center">
                                    <Text className="text-xl font-bold text-ink mb-1" style={{ color: isDark ? '#E5E7EB' : undefined }}>
                                      {stats.total}
                                    </Text>
                                    <IconSymbol name="person.2.fill" size={16} color="#9CA3AF" />
                                </View>
                                <View className="w-[1px] bg-gray-200" />
                                <View className="items-center flex-1 justify-center">
                                    <Text className="text-lg font-bold text-romance mb-1">{stats.romance || 0}</Text>
                                    <IconSymbol name="heart.fill" size={14} color="#E07A5F" />
                                </View>
                                <View className="items-center flex-1 justify-center">
                                    <Text className="text-lg font-bold text-friendship mb-1">{stats.friendship || 0}</Text>
                                    <IconSymbol name="person.2.fill" size={14} color="#81B29A" />
                                </View>
                                <View className="items-center flex-1 justify-center">
                                    <Text className="text-lg font-bold text-business mb-1">{stats.business || 0}</Text>
                                    <IconSymbol name="briefcase.fill" size={14} color="#3D405B" />
                                </View>
                                {stats.hidden && (
                                     <View className="absolute top-2 right-2">
                                         <IconSymbol name="lock.fill" size={12} color="#9CA3AF" />
                                     </View>
                                )}
                            </TouchableOpacity>
                        )}

                        {/* Location */}
                        <View className="flex-row items-center justify-center mb-6">
                            <IconSymbol name="location.fill" size={16} color="#9CA3AF" />
                            <Text className="text-gray-500 ml-1">
                                {mergedProfile.dist_meters ? `${Math.round(mergedProfile.dist_meters)}m away` : 'Nearby'}
                                {mergedProfile.city && ` • ${mergedProfile.city}`}
                                {mergedProfile.state && `, ${mergedProfile.state}`}
                            </Text>
                        </View>

                        {/* Relationship Goals */}
                        {mergedProfile.relationship_goals && mergedProfile.relationship_goals.length > 0 && (
                            <View className="mb-6">
                                <Text className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Looking for</Text>
                                <View className="flex-row flex-wrap justify-center">
                                    {mergedProfile.relationship_goals.map((goal, idx) => {
                                        const badgeColors = getGoalColors(goal);
                                        return (
                                            <View key={idx} className={`px-3 py-1.5 rounded-full mr-2 mb-2 ${badgeColors.badgeBg}`}>
                                                <Text className={`${badgeColors.text} font-bold text-[12px]`}>{goal}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Bio */}
                        {mergedProfile.bio && (
                            <View className="mb-6">
                                <Text className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">About</Text>
                                <Text className="text-ink text-[14px] leading-6 text-center" style={{ color: isDark ? 'rgba(226,232,240,0.92)' : undefined }}>
                                  {mergedProfile.bio}
                                </Text>
                            </View>
                        )}

                        {/* Interests */}
                        <View className="mb-8">
                             <Text className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Interests</Text>
                             {loadingProfile && allInterests.length === 0 && (
                                 <Text className="text-gray-400 italic mb-2">Loading interests...</Text>
                             )}
                             <View className="flex-row flex-wrap justify-center">
                                {allInterests.map((item, idx) => (
                                    <View 
                                        key={idx} 
                                        className={`px-4 py-2 rounded-xl mr-2 mb-2 border ${
                                            item.isShared ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                                        }`}
                                    >
                                        <Text className={`font-medium text-[12px] ${
                                            item.isShared ? 'text-blue-700' : 'text-gray-700'
                                        }`}>
                                            {item.value || item.category}
                                        </Text>
                                    </View>
                                ))}
                             </View>
                             {allInterests.length === 0 && (
                                 <Text className="text-gray-400 italic">No detailed interests shared yet.</Text>
                             )}
                        </View>
                    </View>
                 </ScrollView>

                 {/* Sticky Footer */}
                 <View
                   className="p-4 bg-white border-t border-gray-100 shadow-lg pb-8"
                   style={{
                     backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
                     borderTopColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
                   }}
                 >
                    <ProfileActionButtons
                        profile={mergedProfile}
                        variant="modal"
                        myGoals={myGoals}
                        onStateChange={onStateChange}
                    />
                 </View>
            </Animated.View>

            {/* Full Screen Photo Viewer */}
            <Modal
                visible={fullScreenVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setFullScreenVisible(false)}
            >
                <View className="flex-1 bg-black">
                    {/* Close Button */}
                    <TouchableOpacity
                        onPress={() => setFullScreenVisible(false)}
                        className="absolute top-12 right-4 z-50 bg-black/50 p-3 rounded-full"
                    >
                        <IconSymbol name="xmark" size={24} color="white" />
                    </TouchableOpacity>

                    {/* Photo Carousel */}
                    <ScrollView
                        ref={fullScreenScrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(event) => {
                            const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                            setFullScreenIndex(newIndex);
                        }}
                        className="flex-1"
                    >
                        {displayPhotos.map((photo, index) => (
                            <View 
                                key={index} 
                                style={{ 
                                    width: width, 
                                    height: height,
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => setFullScreenVisible(false)}
                                    style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    <FullScreenProfileImage path={photo.url} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Page Indicator */}
                    {displayPhotos.length > 1 && (
                        <View className="absolute bottom-20 left-0 right-0 flex-row justify-center space-x-2">
                            {displayPhotos.map((_, i) => (
                                <View 
                                    key={i} 
                                    className={`w-2 h-2 rounded-full ${
                                        i === fullScreenIndex ? 'bg-white' : 'bg-white/50'
                                    }`} 
                                />
                            ))}
                        </View>
                    )}
                </View>
            </Modal>
        </Modal>
    );
}

function ProfileImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-gray-100" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}

function FullScreenProfileImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-black" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
    );
}

function SocialIcons({ links }: { links: any }) {
    if (!links) return null;
    const entries = Object.entries(links).filter(([_, v]) => !!v);
    if (entries.length === 0) return null;

    const getIcon = (p: string) => {
        switch (p) {
            case 'instagram': return 'instagram';
            case 'tiktok': return 'tiktok';
            case 'x': return 'twitter'; 
            case 'facebook': return 'facebook';
            case 'linkedin': return 'linkedin';
            default: return 'link';
        }
    };

    const openLink = (p: string, h: string) => {
        let url = h;
        if (!h.startsWith('http')) {
             const clean = h.replace('@', '');
             if (p === 'instagram') url = `https://instagram.com/${clean}`;
             else if (p === 'tiktok') url = `https://tiktok.com/@${clean}`;
             else if (p === 'x') url = `https://x.com/${clean}`;
             else if (p === 'facebook') url = `https://facebook.com/${h}`;
             else if (p === 'linkedin') url = `https://linkedin.com/in/${h}`;
        }
        Linking.openURL(url).catch(err => console.error("Error opening URL:", err));
    };

    return (
        <View className="flex-row space-x-4 items-center">
            {entries.map(([platform, handle]) => (
                <TouchableOpacity key={platform} onPress={() => openLink(platform, handle as string)}>
                    <FontAwesome5 name={getIcon(platform)} size={20} color="#6B7280" />
                </TouchableOpacity>
            ))}
        </View>
    );
}
