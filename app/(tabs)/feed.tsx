import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, FlatList, RefreshControl, Text, TouchableOpacity, View, Image } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
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

  const renderItem = ({ item }: { item: FeedProfile }) => {
    // If no photos, use avatar. If no avatar, placeholder.
    const hasPhotos = item.photos && item.photos.length > 0;
    
    return (
      <View style={{ height: CARD_HEIGHT }} className="w-full mb-8 relative">
        {/* Image Carousel (Simplified as single image for MVP, swipeable later) */}
        <View className="w-full h-full bg-gray-200">
             <FeedImage path={hasPhotos ? item.photos![0].url : item.avatar_url} />
        </View>
        
        {/* Overlay Content */}
        <View className="absolute bottom-0 left-0 right-0 bg-black/40 p-4 pt-12">
            <View className="flex-row justify-between items-end mb-2">
                <View>
                    <View className="flex-row items-center">
                         <Text className="text-white text-3xl font-bold shadow-sm">{item.full_name}</Text>
                         {item.is_verified && (
                             <View className="ml-2 bg-white rounded-full">
                                <IconSymbol name="checkmark.seal.fill" size={24} color="#3B82F6" />
                             </View>
                         )}
                    </View>
                    <Text className="text-gray-200 text-lg font-medium">@{item.username}</Text>
                </View>
                
                <View className="items-end">
                    <View className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full mb-2">
                         <Text className="text-white font-bold">{Math.round(item.dist_meters / 1000)}km away</Text>
                    </View>
                    {item.shared_interests_count > 0 && (
                        <View className="bg-blue-500 px-3 py-1 rounded-full">
                            <Text className="text-white font-bold">
                                {item.shared_interests_count} Matches
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Relationship Goals */}
            {item.relationship_goals && item.relationship_goals.length > 0 && (
                <View className="flex-row mb-2">
                    {item.relationship_goals.map((goal, idx) => (
                        <View key={idx} className="bg-white/20 px-2 py-1 rounded mr-2">
                             <Text className="text-white text-xs font-bold uppercase">{goal}</Text>
                        </View>
                    ))}
                </View>
            )}

            <Text className="text-white text-base leading-5 mb-3" numberOfLines={2}>
                {item.bio}
            </Text>

            {/* Detailed Interests Preview */}
            {item.detailed_interests && (
                <View className="flex-row flex-wrap mb-4">
                    {Object.entries(item.detailed_interests).slice(0, 3).map(([cat, details], i) => (
                        <View key={i} className="bg-white/10 px-2 py-1 rounded-lg mr-2 mb-1 border border-white/20">
                            <Text className="text-white text-xs">
                                {details.length > 0 ? `${cat}: ${details[0]}` : cat}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Actions */}
            <View className="flex-row justify-between items-center mt-2">
                 <TouchableOpacity 
                    className="p-3 bg-white/20 rounded-full"
                    onPress={() => handleSafety(item.id)}
                 >
                     <IconSymbol name="ellipsis" size={24} color="white" />
                 </TouchableOpacity>

                 <TouchableOpacity 
                    className="flex-1 bg-blue-600 mx-4 py-4 rounded-xl items-center shadow-lg"
                    onPress={() => {
                        Alert.alert('Sent!', `Interest sent to ${item.full_name}`);
                        // Add actual logic: insert into interests table
                    }}
                 >
                     <Text className="text-white font-bold text-lg">Send Interest</Text>
                 </TouchableOpacity>
            </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-black">
      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFeed} tintColor="white" />}
        contentContainerStyle={{ paddingBottom: 80 }}
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
  
    if (!url) return <View className="w-full h-full bg-gray-800" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}
