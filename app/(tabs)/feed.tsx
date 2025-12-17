import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

// Keep card height manageable, not full screen to encourage scrolling
const CARD_HEIGHT = width * 1.3; 

type Photo = {
  url: string;
  order: number;
};

type FeedProfile = {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string | null;
  dist_meters: number;
  photos: Photo[] | null;
  detailed_interests: Record<string, string[]> | null;
  relationship_goals: string[] | null;
  is_verified: boolean; // NEW
  shared_interests_count: number;
};

const CITY_RANGE = 30000; // 30km for "City"

export default function CityFeedScreen() {
  const { user } = useAuth();
  const { location } = useProxyLocation();
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchFeed = async () => {
    if (!user || !location) return;

    setLoading(true);

    const { data, error } = await supabase.rpc('get_feed_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: CITY_RANGE
    });

    if (error) {
      console.error('Error fetching city feed:', error);
    } else {
      setFeed(data || []);
    }
    setLoading(false);
  };

  const handleSafety = (targetUserId: string) => {
    if (user) {
        showSafetyOptions(user.id, targetUserId, () => {
            // Remove user from feed immediately
            setFeed(prev => prev.filter(p => p.id !== targetUserId));
        });
    }
  };

  // Initial load
  useCallback(() => {
    fetchFeed();
  }, [location]);

  const getTheme = (goal?: string) => {
      switch(goal) {
          case 'Romance': return { button: 'bg-romance', badge: 'bg-romance/20', text: 'text-romance', border: 'border-romance/50' };
          case 'Friendship': return { button: 'bg-friendship', badge: 'bg-friendship/20', text: 'text-friendship', border: 'border-friendship/50' };
          case 'Business': return { button: 'bg-business', badge: 'bg-business/20', text: 'text-business', border: 'border-business/50' };
          default: return { button: 'bg-white', badge: 'bg-white/20', text: 'text-white', border: 'border-white/20' };
      }
  };

  const renderItem = ({ item }: { item: FeedProfile }) => {
    // If no photos, use avatar. If no avatar, placeholder.
    const hasPhotos = item.photos && item.photos.length > 0;
    const primaryGoal = item.relationship_goals?.[0];
    const theme = getTheme(primaryGoal);
    
    return (
      <View style={{ height: CARD_HEIGHT }} className="w-full mb-8 relative">
        {/* Image Carousel (Simplified as single image for MVP, swipeable later) */}
        <View className="w-full h-full bg-ink">
             <FeedImage path={hasPhotos ? item.photos![0].url : item.avatar_url} />
        </View>
        
        {/* Overlay Content */}
        <View className="absolute bottom-0 left-0 right-0 bg-ink/60 p-5 pt-16">
            <View className="flex-row justify-between items-end mb-3">
                <View>
                    <View className="flex-row items-center">
                         <Text className="text-paper text-3xl font-extrabold shadow-sm tracking-tight">{item.full_name}</Text>
                         {item.is_verified && (
                             <View className="ml-2 bg-white rounded-full">
                                <IconSymbol name="checkmark.seal.fill" size={24} color="#3B82F6" />
                             </View>
                         )}
                    </View>
                    <Text className="text-gray-300 text-lg font-medium">@{item.username}</Text>
                </View>
                
                <View className="items-end">
                    <View className="bg-ink/40 backdrop-blur-md px-3 py-1 rounded-full mb-2 border border-white/10">
                         <Text className="text-gray-300 font-bold text-xs">{Math.round(item.dist_meters / 1000)}km away</Text>
                    </View>
                    {item.shared_interests_count > 0 && (
                        <View className={`${theme.button} px-3 py-1 rounded-full shadow-lg`}>
                            <Text className="text-white font-bold text-xs uppercase tracking-wide">
                                {item.shared_interests_count} Matches
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Relationship Goals */}
            {item.relationship_goals && item.relationship_goals.length > 0 && (
                <View className="flex-row mb-3">
                    {item.relationship_goals.map((goal, idx) => {
                        const goalTheme = getTheme(goal);
                        return (
                            <View key={idx} className={`px-2 py-1 rounded mr-2 border ${goalTheme.border} ${goalTheme.badge}`}>
                                <Text className={`${goalTheme.text} text-xs font-bold uppercase tracking-wider`}>{goal}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            <Text className="text-paper text-base leading-6 mb-4 font-medium" numberOfLines={3}>
                {item.bio}
            </Text>

            {/* Detailed Interests Preview */}
            {item.detailed_interests && (
                <View className="flex-row flex-wrap mb-6">
                    {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                        <View key={i} className="bg-paper/10 px-3 py-1.5 rounded-lg mr-2 mb-2 border border-paper/20">
                            <Text className="text-paper text-xs font-semibold">
                                {details.length > 0 ? `${cat}: ${details[0]}` : cat}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Actions */}
            <View className="flex-row justify-between items-center mt-2">
                 <TouchableOpacity 
                    className="p-4 bg-paper/10 rounded-full backdrop-blur-md"
                    onPress={() => handleSafety(item.id)}
                 >
                     <IconSymbol name="ellipsis" size={24} color="white" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    className={`flex-1 mx-4 py-4 rounded-2xl items-center shadow-xl ${theme.button}`}
                    onPress={() => {
                        Alert.alert('Sent!', `Interest sent to ${item.full_name}`);
                        // Add actual logic: insert into interests table
                    }}
                 >
                     <Text className="text-white font-bold text-lg tracking-widest uppercase">Send Interest</Text>
                 </TouchableOpacity>
            </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-ink">
      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFeed} tintColor="white" />}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-32 px-10 opacity-70">
                <IconSymbol name="moon.stars.fill" size={64} color="#A0AEC0" />
                <Text className="text-gray-400 text-xl font-bold mt-6 text-center">It's quiet in the city...</Text>
                <Text className="text-gray-600 text-base mt-2 text-center">Be the first to share your profile!</Text>
            </View>
        }
      />
    </View>
  );
}

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
