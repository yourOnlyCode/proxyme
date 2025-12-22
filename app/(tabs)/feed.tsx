import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

type StatusItem = {
    id: string;
    content: string | null;
    type: 'text' | 'image';
    caption?: string;
    created_at: string;
    expires_at: string;
};

type FeedProfile = ProfileData & {
  dist_meters: number;
  statuses?: StatusItem[];
};

const CITY_RANGE = 50000; // 50km for "City"

export default function CityFeedScreen() {
  const { width, height: windowHeight } = useWindowDimensions();
  let tabBarHeight = 0;
  try {
      tabBarHeight = useBottomTabBarHeight();
  } catch (e) {
      tabBarHeight = 80; // Fallback
  }

  const [listHeight, setListHeight] = useState(windowHeight - tabBarHeight);
  const { user } = useAuth();
  const { location, address } = useProxyLocation();
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [myInterests, setMyInterests] = useState<Record<string, string[]> | null>(null);
  const [myGoals, setMyGoals] = useState<string[] | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (user) {
        supabase.from('profiles').select('detailed_interests, relationship_goals').eq('id', user.id).single()
        .then(({ data }) => {
            if (data) {
                setMyInterests(data.detailed_interests);
                setMyGoals(data.relationship_goals);
            }
        });
    }
  }, [user]);

  const fetchFeed = async () => {
    if (!user || !location) return;

    setLoading(true);

    const { data, error } = await supabase.rpc('get_city_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: CITY_RANGE
    });

    if (error) {
      console.error('Error fetching city feed:', error);
    } else if (data) {
      // 1. Filter: Only show users with active statuses
      let filtered = data.filter((u: FeedProfile) => u.statuses && u.statuses.length > 0);

      // 2. Sort: Top down based on Interest Match Score
      if (myInterests) {
          filtered.sort((a: FeedProfile, b: FeedProfile) => {
              const scoreA = calculateRawMatchScore(a.detailed_interests);
              const scoreB = calculateRawMatchScore(b.detailed_interests);
              return scoreB - scoreA; // Descending order
          });
      }

      setFeed(filtered);
    }
    setLoading(false);
  };

  const calculateRawMatchScore = (userInterests: any) => {
      if (!myInterests || !userInterests) return 0;
      let score = 0;
      Object.keys(myInterests).forEach(cat => {
          if (userInterests[cat]) {
              score += 1; // Category match
              const myTags = myInterests[cat].map((t: string) => t.toLowerCase().trim());
              userInterests[cat].forEach((t: string) => {
                  if (myTags.includes(t.toLowerCase().trim())) score += 5; // Tag match
              });
          }
      });
      return score;
  };

  // Initial load & Re-sort when interests load
  useEffect(() => {
    fetchFeed();
  }, [location, myInterests]);

  const sendInterest = async (targetUserId: string) => {
      const { error } = await supabase
        .from('interests')
        .insert({
            sender_id: user?.id,
            receiver_id: targetUserId,
            status: 'pending'
        });
      
      if (error) {
          if (error.code === '23505') {
               Alert.alert('Already Connected', 'You have already sent an interest to this person.');
          } else {
               Alert.alert('Error', error.message);
          }
      } else {
          Alert.alert('Sent!', 'Interest sent successfully.');
      }
  };

  const handleSafety = (targetUserId: string) => {
    if (user) {
        showSafetyOptions(user.id, targetUserId, () => {
            // Remove user from feed immediately
            setFeed(prev => prev.filter(p => p.id !== targetUserId));
        });
    }
  };

  const openProfile = (profile: FeedProfile) => {
      setSelectedProfile(profile);
      setModalVisible(true);
  };

  const calculateMatchPercentage = (score: number) => {
    if (!myInterests) return 0;
    const myCatCount = Object.keys(myInterests).length;
    if (myCatCount === 0) return 0;
    const maxScore = myCatCount * 16; 
    return Math.round((score / maxScore) * 100);
  };

  return (
    <View className="flex-1 bg-ink">
      <FlatList
        data={feed}
        renderItem={({ item }) => (
            <CityFeedCard 
                item={item} 
                width={width} 
                listHeight={listHeight} 
                tabBarHeight={tabBarHeight} 
                router={router} 
                sendInterest={sendInterest} 
                handleSafety={handleSafety} 
                openProfile={openProfile}
                percentage={calculateMatchPercentage(item.shared_interests_count || 0)}
            />
        )}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFeed} tintColor="white" />}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        decelerationRate="fast"
        ListEmptyComponent={
            <View style={{ height: listHeight }} className="items-center justify-center px-10 opacity-70">
                <IconSymbol name="moon.stars.fill" size={64} color="#A0AEC0" />
                <Text className="text-gray-400 text-xl font-bold mt-6 text-center">It's quiet in {address?.city || 'the city'}...</Text>
                <Text className="text-gray-600 text-base mt-2 text-center">Be the first to share your status!</Text>
            </View>
        }
        ListFooterComponent={
            feed.length > 0 ? (
                <View style={{ height: listHeight, width: width }} className="bg-ink items-center justify-center px-8">
                    <IconSymbol name="checkmark.circle.fill" size={80} color="#4ade80" />
                    <Text className="text-white text-3xl font-extrabold mt-6 text-center">You're All Caught Up!</Text>
                    <Text className="text-gray-400 text-lg mt-4 text-center mb-8">
                        Start a conversation with your connections.
                    </Text>
                    <TouchableOpacity 
                        onPress={() => router.push('/interests')}
                        className="bg-white px-8 py-4 rounded-full shadow-lg"
                    >
                        <Text className="text-ink font-bold text-lg uppercase tracking-wider">Go to Connections</Text>
                    </TouchableOpacity>
                </View>
            ) : null
        }
      />
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         myInterests={myInterests}
         myGoals={myGoals}
         mode="send_interest"
      />
    </View>
  );
}

function CityFeedCard({ 
    item, 
    width, 
    listHeight, 
    tabBarHeight, 
    router, 
    sendInterest, 
    handleSafety, 
    openProfile,
    percentage 
}: { 
    item: FeedProfile, 
    width: number, 
    listHeight: number, 
    tabBarHeight: number, 
    router: any, 
    sendInterest: (id: string) => void, 
    handleSafety: (id: string) => void,
    openProfile: (profile: FeedProfile) => void,
    percentage: number
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const statuses = item.statuses || [];
    const currentStatus = statuses[activeIndex];

    const handleTap = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        if (x < width * 0.3) {
            // Previous
            if (activeIndex > 0) setActiveIndex(activeIndex - 1);
        } else {
            // Next
            if (activeIndex < statuses.length - 1) setActiveIndex(activeIndex + 1);
            else {
                // If last, open profile? or just stop?
                // openProfile(item);
            }
        }
    };

    const primaryGoal = item.relationship_goals?.[0];
    const theme = getTheme(primaryGoal);
    const isConnected = !!item.connection_id;

    if (!currentStatus) return null; // Should not happen due to filter

    return (
      <View style={{ height: listHeight, width: width }} className="bg-black relative shadow-2xl overflow-hidden">
        
        {/* Status Progress Bars */}
        <View className="absolute top-14 left-2 right-2 flex-row gap-1 z-50 h-1">
            {statuses.map((_, i) => (
                <View 
                    key={i} 
                    className={`flex-1 h-full rounded-full ${i <= activeIndex ? 'bg-white' : 'bg-white/30'}`}
                />
            ))}
        </View>

        {/* Content Area (Tap to Advance) */}
        <TouchableWithoutFeedback onPress={handleTap}>
            <View style={{ width, height: listHeight }}>
                {currentStatus.type === 'image' ? (
                    <FeedImage path={currentStatus.content} containerHeight={listHeight} containerWidth={width} />
                ) : (
                    <View className="w-full h-full items-center justify-center bg-ink p-8">
                         <Text className="text-white text-2xl font-bold italic text-center leading-9">
                             "{currentStatus.content}"
                         </Text>
                    </View>
                )}
                {/* Gradient Overlay for Text Visibility if Image */}
                {currentStatus.type === 'image' && (
                    <View className="absolute inset-0 bg-black/10" />
                )}
            </View>
        </TouchableWithoutFeedback>
            
        {/* Top Overlay: Compact Header */}
        <View className="absolute top-0 left-0 right-0 pt-16 pb-4 px-4 pointer-events-none">
            <View className="flex-row items-center mt-4">
                 <TouchableOpacity onPress={() => openProfile(item)} className="flex-row items-center">
                    {/* Small Avatar next to name */}
                    <View className="w-8 h-8 rounded-full overflow-hidden mr-2 border border-white/50">
                        <FeedImage path={item.avatar_url} containerHeight={32} containerWidth={32} />
                    </View>
                    <View>
                        <View className="flex-row items-center">
                            <Text className="text-white text-base font-bold mr-1 shadow-md">{item.full_name}</Text>
                            {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                        </View>
                        <View className="flex-row items-center">
                            <Text className="text-gray-300 text-[10px] font-semibold shadow-sm">@{item.username}</Text>
                            {currentStatus && (
                                <Text className="text-gray-400 text-[9px] ml-2 shadow-sm">
                                    • {formatTimeAgo(currentStatus.created_at)}
                                </Text>
                            )}
                        </View>
                    </View>
                 </TouchableOpacity>

                 <View className="ml-auto flex-row items-center bg-black/30 px-2 py-0.5 rounded border border-white/10 backdrop-blur-md">
                     <IconSymbol name="location.fill" size={10} color="#E5E7EB" style={{marginRight:3}}/>
                     <Text className="text-gray-200 text-[10px] font-bold uppercase shadow-sm">
                        {item.city ? item.city : Math.round(item.dist_meters / 1000) + 'km'}
                     </Text>
                 </View>
            </View>
            {percentage > 0 && (
                 <View className="self-start mt-2 bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                      <Text className="text-white text-[10px] font-bold">{percentage}% Match</Text>
                 </View>
            )}
        </View>

        {/* Bottom Overlay: Caption/Bio & Actions */}
        <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12" style={{ paddingBottom: tabBarHeight + 8 }}>
            <View className="flex-row items-end justify-between">
                {/* Left Column: Text Content */}
                <View className="flex-1 mr-4">
                    {/* If Image, show Caption or Text status */}
                    {currentStatus.caption && (
                        <Text className="text-white text-base font-medium italic mb-2 leading-6 shadow-sm">
                            "{currentStatus.caption}"
                        </Text>
                    )}
                    
                    {/* Relationship Goals */}
                    {item.relationship_goals && item.relationship_goals.length > 0 && (
                        <View className="flex-row mb-2 flex-wrap">
                            {item.relationship_goals.map((goal, idx) => {
                                const goalTheme = getTheme(goal);
                                return (
                                    <View key={idx} className={`px-2 py-0.5 rounded mr-2 mb-1 border ${goalTheme.border} ${goalTheme.badge}`}>
                                        <Text className={`${goalTheme.text} text-[10px] font-bold uppercase tracking-wider`}>{goal}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Bio Teaser */}
                    <Text className="text-gray-200 text-xs leading-4 mb-2 font-medium shadow-sm opacity-80" numberOfLines={2}>
                        {item.bio}
                    </Text>

                    {/* Detailed Interests Preview */}
                    {item.detailed_interests && (
                        <View className="flex-row flex-wrap mb-1 opacity-70">
                            {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                                <Text key={i} className="text-white text-[10px] mr-2">
                                    #{cat}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* Right Column: Actions */}
                <View className="items-center pb-1 gap-y-4 mb-6">
                     <TouchableOpacity 
                        className="w-10 h-10 bg-black/20 rounded-full items-center justify-center backdrop-blur-md border border-white/10"
                        onPress={(e) => {
                            e.stopPropagation(); 
                            handleSafety(item.id);
                        }}
                    >
                        <IconSymbol name="ellipsis" size={20} color="white" />
                    </TouchableOpacity>

                    {isConnected ? (
                        <TouchableOpacity 
                            className="w-10 h-10 rounded-full items-center justify-center shadow-xl bg-ink border border-white/10"
                            onPress={(e) => {
                                e.stopPropagation();
                                router.push(`/chat/${item.connection_id}`);
                            }}
                        >
                            <IconSymbol name="bubble.left.fill" size={18} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            className={`w-10 h-10 rounded-full items-center justify-center shadow-xl ${theme.button} border border-white/10 bg-opacity-80`}
                            onPress={(e) => {
                                e.stopPropagation(); 
                                openProfile(item);
                            }}
                        >
                            <IconSymbol name="eye.fill" size={18} color="white" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
      </View>
    );
}

const getTheme = (goal?: string) => {
    switch(goal) {
        case 'Romance': return { button: 'bg-romance', badge: 'bg-romance/20', text: 'text-romance', border: 'border-romance/50' };
        case 'Friendship': return { button: 'bg-friendship', badge: 'bg-friendship/20', text: 'text-friendship', border: 'border-friendship/50' };
        case 'Business': return { button: 'bg-business', badge: 'bg-business/20', text: 'text-business', border: 'border-business/50' };
        default: return { button: 'bg-white', badge: 'bg-white/20', text: 'text-white', border: 'border-white/20' };
    }
};

function FeedImage({ path, containerHeight, containerWidth }: { path: string | null, containerHeight?: number, containerWidth?: number }) {
    const [url, setUrl] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
    useEffect(() => {
      if (!path) return;
      if (path.startsWith('http')) {
          setUrl(path);
          return;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);

    // Get image dimensions when URL loads (only for main feed images, not avatars)
    useEffect(() => {
        if (!url || !containerHeight || !containerWidth || containerHeight < 100) return; // Skip for small avatars
        
        Image.getSize(url, (width, height) => {
            setImageDimensions({ width, height });
        }, () => {
            // If getSize fails, assume square
            setImageDimensions({ width: 1, height: 1 });
        });
    }, [url, containerHeight, containerWidth]);
  
    if (!url) return <View className="w-full h-full bg-ink" />;

    // For main feed images (not avatars), check orientation and apply appropriate display
    if (containerHeight && containerWidth && containerHeight > 100 && imageDimensions) {
        const imageAspect = imageDimensions.width / imageDimensions.height;
        
        // If image is landscape (width > height, aspect > 1), letterbox it with black bars
        // If image is vertical (height > width, aspect < 1), fill the screen
        if (imageAspect > 1) {
            // Image is landscape (wider than tall) - letterbox (black bars top/bottom)
            const imageDisplayHeight = containerWidth / imageAspect;
            
            return (
                <View className="w-full h-full bg-black items-center justify-center">
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: containerWidth, height: imageDisplayHeight }}
                        resizeMode="contain"
                    />
                </View>
            );
        } else {
            // Image is vertical or square (height >= width) - fill the screen without cropping
            // Use contain to show full image, then center it
            const imageAspect = imageDimensions.width / imageDimensions.height;
            const containerAspect = containerWidth / containerHeight;
            
            if (imageAspect < containerAspect) {
                // Image is taller relative to container - fit height, center horizontally
                const imageDisplayWidth = containerHeight * imageAspect;
                return (
                    <View className="w-full h-full bg-black items-center justify-center">
                        <Image 
                            source={{ uri: url }} 
                            style={{ width: imageDisplayWidth, height: containerHeight }}
                            resizeMode="contain"
                        />
                    </View>
                );
            } else {
                // Image fits width - fill screen
                return (
                    <Image 
                        source={{ uri: url }} 
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                    />
                );
            }
        }
    }
  
    // Default: fill screen (for avatars or when dimensions aren't loaded yet)
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}

function formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    // For older posts, show date
    return time.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
