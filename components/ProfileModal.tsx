import { ProfileActionButtons } from '@/components/ProfileActionButtons';
import { useConnectionState } from '@/hooks/useConnectionState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

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
    const [stats, setStats] = useState<{ total: number, romance: number, friendship: number, business: number, hidden?: boolean } | null>(null);
    const [fetchedPhotos, setFetchedPhotos] = useState<{ url: string; order: number }[] | null>(null);
    const [fullScreenVisible, setFullScreenVisible] = useState(false);
    const [fullScreenIndex, setFullScreenIndex] = useState(0);
    const fullScreenScrollRef = useRef<ScrollView>(null);

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
        } else {
            setFetchedPhotos(null);
        }
    }, [profile?.id, visible]);

    // Use connection state hook - MUST be called before any early returns
    const connectionState = useConnectionState(profile);
    const isTrulyConnected = connectionState.state === 'already_connected';

    if (!profile) return null;
    
    const getGoalColors = (goal?: string) => {
        switch(goal) {
            case 'Romance': return { bg: 'bg-romance/5', border: 'border-romance/30', text: 'text-romance', badgeBg: 'bg-romance/10' };
            case 'Friendship': return { bg: 'bg-friendship/5', border: 'border-friendship/30', text: 'text-friendship', badgeBg: 'bg-friendship/10' };
            case 'Business': return { bg: 'bg-business/5', border: 'border-business/30', text: 'text-business', badgeBg: 'bg-business/10' };
            default: return { bg: 'bg-white', border: 'border-gray-200', text: 'text-ink', badgeBg: 'bg-gray-100' };
        }
    };

    const primaryGoal = profile.relationship_goals?.[0];
    const colors = getGoalColors(primaryGoal);

    // Calculate Shared Interests Score & Percentage locally
    let sharedScore = 0;
    const allInterests: { category: string, value: string, isShared: boolean }[] = [];
    
    if (profile.detailed_interests) {
        Object.entries(profile.detailed_interests).forEach(([cat, values]) => {
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

    const calculateMatchPercentage = () => {
        if (!myInterests) return 0;
        const myCatCount = Object.keys(myInterests).length;
        if (myCatCount === 0) return 0;
        const maxScore = myCatCount * 16;
        return Math.round((sharedScore / maxScore) * 100);
    };

    const matchPercentage = calculateMatchPercentage();

    // Prepare Photos
    const galleryPhotos = fetchedPhotos || profile.photos || [];
    const displayPhotos: { url: string }[] = [];
    if (profile.avatar_url) displayPhotos.push({ url: profile.avatar_url });
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
            <View className="flex-1 bg-white">
                 <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
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

                    <View className="px-6 -mt-10 pt-4 bg-white rounded-t-3xl shadow-lg">
                        {/* Name & Badge */}
                        <View className="flex-row items-center justify-between mb-2">
                             <View className="flex-row items-center flex-1">
                                <Text className="text-3xl font-extrabold text-ink mr-2">{profile.full_name}</Text>
                                {isTrulyConnected && (
                                    <IconSymbol name="star.fill" size={24} color="#F59E0B" style={{ marginRight: 8 }} />
                                )}
                                {profile.is_verified && (
                                    <IconSymbol name="checkmark.seal.fill" size={24} color="#3B82F6" style={{ marginRight: 8 }} />
                                )}
                                {matchPercentage > 0 && (
                                    <View className="bg-green-100 px-2 py-1 rounded-lg">
                                        <Text className="text-green-700 font-bold text-xs">{matchPercentage}% Match</Text>
                                    </View>
                                )}
                             </View>
                        </View>
                        
                        {/* Username & Socials */}
                        <View className="flex-row items-center mb-4 flex-wrap">
                            <Text className="text-gray-500 font-medium text-lg mr-3">@{profile.username}</Text>
                            <SocialIcons links={profile.social_links} />
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
                            >
                                <View className="items-center flex-1 justify-center">
                                    <Text className="text-xl font-bold text-ink mb-1">{stats.total}</Text>
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
                        <View className="flex-row items-center mb-6">
                            <IconSymbol name="location.fill" size={16} color="#9CA3AF" />
                            <Text className="text-gray-500 ml-1">
                                {profile.dist_meters ? `${Math.round(profile.dist_meters)}m away` : 'Nearby'}
                                {profile.city && ` • ${profile.city}`}
                                {profile.state && `, ${profile.state}`}
                            </Text>
                        </View>

                        {/* Relationship Goals */}
                        {profile.relationship_goals && profile.relationship_goals.length > 0 && (
                            <View className="mb-6">
                                <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Looking For</Text>
                                <View className="flex-row flex-wrap">
                                    {profile.relationship_goals.map((goal, idx) => {
                                        const badgeColors = getGoalColors(goal);
                                        return (
                                            <View key={idx} className={`px-4 py-2 rounded-full mr-2 mb-2 ${badgeColors.badgeBg}`}>
                                                <Text className={`${badgeColors.text} font-bold`}>{goal}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Bio */}
                        {profile.bio && (
                            <View className="mb-6">
                                <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">About</Text>
                                <Text className="text-ink text-lg leading-7">{profile.bio}</Text>
                            </View>
                        )}

                        {/* Interests */}
                        <View className="mb-8">
                             <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Interests</Text>
                             <View className="flex-row flex-wrap">
                                {allInterests.map((item, idx) => (
                                    <View 
                                        key={idx} 
                                        className={`px-4 py-2 rounded-xl mr-2 mb-2 border ${
                                            item.isShared ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                                        }`}
                                    >
                                        <Text className={`font-medium ${
                                            item.isShared ? 'text-blue-700' : 'text-gray-700'
                                        }`}>
                                            {item.value || item.category}
                                        </Text>
                                        {item.isShared && (
                                             <View className="absolute -top-1 -right-1 bg-blue-500 rounded-full w-3 h-3 border border-white" />
                                        )}
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
                 <View className="p-4 bg-white border-t border-gray-100 shadow-lg pb-8">
                    <ProfileActionButtons
                        profile={profile}
                        variant="modal"
                        myGoals={myGoals}
                        onStateChange={onStateChange}
                    />
                 </View>
            </View>

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
