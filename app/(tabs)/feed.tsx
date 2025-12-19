import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { ProfileData, ProfileModal } from '../../components/ProfileModal';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

type FeedProfile = ProfileData & {
  dist_meters: number;
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

    // Use new RPC that ignores proxy status and returns city/state
    const { data, error } = await supabase.rpc('get_city_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: CITY_RANGE
    });

    if (error) {
      console.error('Error fetching city feed:', error);
    } else if (data) {
      // 1. Filter: Only show users with an active Status
      let filtered = data.filter((u: FeedProfile) => u.status_text || u.status_image_url);

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
      {/* Header Overlay */}
      <View className="absolute top-12 right-4 z-10">
          <TouchableOpacity 
              onPress={() => router.push('/requests')}
              className="bg-black/30 p-2 rounded-full backdrop-blur-md"
          >
              <IconSymbol name="tray.fill" size={24} color="white" />
          </TouchableOpacity>
      </View>

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
                <Text className="text-gray-600 text-base mt-2 text-center">Be the first to share your profile!</Text>
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
    const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    }).current;
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

    const primaryGoal = item.relationship_goals?.[0];
    const theme = getTheme(primaryGoal);
    const isConnected = !!item.connection_id;
    
    // Construct Gallery: Status Image -> Photos -> Avatar
    const galleryImages: string[] = [];
    if (item.status_image_url) galleryImages.push(item.status_image_url);
    if (item.photos && item.photos.length > 0) {
        item.photos.forEach(p => galleryImages.push(p.url));
    }
    if (item.avatar_url) galleryImages.push(item.avatar_url);
    
    // Unique images
    const uniqueImages = Array.from(new Set(galleryImages));
    const displayImages = uniqueImages.length > 0 ? uniqueImages : [null];

    return (
      <View style={{ height: listHeight, width: width }} className="bg-black relative shadow-2xl overflow-hidden">
        {/* Horizontal Carousel */}
        <FlatList
            data={displayImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(img, idx) => `city-${item.id}-${idx}`}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item: imgPath }) => (
                <View style={{ width, height: listHeight }}>
                    <TouchableOpacity 
                        activeOpacity={1} 
                        onPress={() => openProfile(item)}
                        className="w-full h-full"
                    >
                        <FeedImage path={imgPath} />
                    </TouchableOpacity>
                </View>
            )}
        />

        {/* Page Indicator (Dots) */}
        {displayImages.length > 1 && (
            <View className="absolute top-24 left-0 right-0 flex-row justify-center space-x-1.5 z-20">
                {displayImages.map((_, i) => (
                    <View 
                        key={i} 
                        className={`w-2 h-2 rounded-full backdrop-blur-md ${i === activeIndex ? 'bg-white' : 'bg-white/30'}`} 
                    />
                ))}
            </View>
        )}
            
        {/* Top Overlay: Compact Header */}
        <View className="absolute top-0 left-0 right-0 pt-16 pb-4 px-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
            <View className="flex-row items-center flex-wrap shadow-sm">
                <Text className="text-white text-xl font-bold mr-2 shadow-md">{item.full_name}</Text>
                {item.is_verified && (
                    <IconSymbol name="checkmark.seal.fill" size={16} color="#3B82F6" style={{ marginRight: 6 }} />
                )}
                <Text className="text-gray-300 text-xs font-semibold mr-3 shadow-sm">@{item.username}</Text>
                
                <View className="flex-row items-center bg-black/30 px-2 py-0.5 rounded border border-white/10 backdrop-blur-md">
                     <IconSymbol name="location.fill" size={10} color="#E5E7EB" style={{marginRight:3}}/>
                     <Text className="text-gray-200 text-[10px] font-bold uppercase shadow-sm">
                        {item.city ? item.city : Math.round(item.dist_meters / 1000) + 'km'}
                     </Text>
                </View>
            </View>
            {item.shared_interests_count && item.shared_interests_count > 0 && percentage > 0 && (
                <View className="absolute right-4 top-12 bg-white/20 px-2 py-1 rounded-full backdrop-blur-md border border-white/10">
                     <Text className="text-white text-[10px] font-bold">{percentage}% Match</Text>
                </View>
            ) || null}
        </View>

        {/* Bottom Overlay: Status & Actions */}
        <View className="absolute bottom-0 left-0 right-0 bg-black/30 p-4 pt-6" style={{ paddingBottom: tabBarHeight + 8 }}>
            <View className="flex-row items-end justify-between">
                {/* Left Column: Text Content */}
                <View className="flex-1 mr-4">
                    {/* Status Headline */}
                    {item.status_text && (
                        <View>
                            <Text className="text-[10px] text-gray-300 underline mb-0.5 font-medium italic">currently:</Text>
                            <Text className="text-white text-lg font-bold italic mb-2 leading-6 shadow-sm">
                                "{item.status_text}"
                            </Text>
                        </View>
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

                    {!item.status_text && (
                        <Text className="text-gray-100 text-sm leading-5 mb-3 font-medium shadow-sm" numberOfLines={2}>
                            {item.bio}
                        </Text>
                    )}

                    {/* Detailed Interests Preview */}
                    {item.detailed_interests && (
                        <View className="flex-row flex-wrap mb-1">
                            {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                                <View key={i} className="bg-white/20 px-2 py-1 rounded-lg mr-2 mb-1 border border-white/10">
                                    <Text className="text-white text-[10px] font-semibold">
                                        {details.length > 0 ? `${cat}: ${details[0]}` : cat}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Right Column: Actions */}
                <View className="items-center pb-1 gap-y-4">
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

function FeedImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-ink" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}