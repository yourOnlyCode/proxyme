import { IconSymbol } from '@/components/ui/icon-symbol';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height - 90; 

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
  shared_interests_count: number;
};

export default function FeedScreen() {
  const { user } = useAuth();
  const { location } = useProxyLocation();
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const fetchFeed = async () => {
    if (!user || !location) return;
    setLoading(true);

    const { data, error } = await supabase.rpc('get_feed_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: 30000 
    });

    if (!error) {
      setFeed(data || []);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFeed();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    }, [location])
  );

  const sendInterest = async (targetUserId: string) => {
      const { error } = await supabase
        .from('interests')
        .insert({
            sender_id: user?.id,
            receiver_id: targetUserId,
            status: 'pending'
        });
      
      if (error) {
          Alert.alert('Error', error.message);
      } else {
          Alert.alert('Sent!', 'Interest sent successfully.');
      }
  };

  const handleSafety = (targetUserId: string) => {
      if (user) {
          showSafetyOptions(user.id, targetUserId, () => {
              // Remove blocked user from feed immediately
              setFeed(prev => prev.filter(p => p.id !== targetUserId));
          });
      }
  };

  const renderItem = ({ item }: { item: FeedProfile }) => {
     let displayPhotos: string[] = [];
     if (item.photos && item.photos.length > 0) {
         displayPhotos = item.photos.map(p => p.url);
     } else if (item.avatar_url) {
         displayPhotos = [item.avatar_url];
     }

     return (
         <View style={{ width, height: ITEM_HEIGHT }} className="bg-black relative">
             <FlatList
                data={displayPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(photo, index) => `${item.id}-${index}`}
                renderItem={({ item: photoUrl }) => (
                    <FeedImage path={photoUrl} style={{ width, height: ITEM_HEIGHT }} />
                )}
             />
             
             {displayPhotos.length > 1 && (
                 <View className="absolute top-10 left-0 right-0 flex-row justify-center space-x-2">
                     {displayPhotos.map((_, i) => (
                         <View key={i} className="w-16 h-1 bg-white/30 rounded-full mx-1" />
                     ))}
                 </View>
             )}

             {/* Safety Button */}
             <TouchableOpacity 
                className="absolute top-12 right-4 bg-black/40 p-2 rounded-full backdrop-blur-md z-10"
                onPress={() => handleSafety(item.id)}
             >
                 <IconSymbol name="ellipsis" size={24} color="white" />
             </TouchableOpacity>

             <View className="absolute bottom-0 left-0 right-0 h-3/4 bg-black/40" pointerEvents="none" />

             <View className="absolute bottom-10 left-4 right-4">
                 <View className="flex-row items-center mb-1">
                     <Text className="text-white text-3xl font-bold mr-2 shadow-sm">{item.full_name}</Text>
                 </View>
                 <Text className="text-gray-300 text-xl mb-3 shadow-sm">@{item.username}</Text>

                 {/* Relationship Goals */}
                 {item.relationship_goals && item.relationship_goals.length > 0 && (
                     <View className="flex-row flex-wrap mb-3">
                         {item.relationship_goals.map((goal, idx) => (
                             <View key={idx} className="bg-white/20 px-2 py-1 rounded mr-2 mb-1 backdrop-blur-sm">
                                 <Text className="text-white text-xs font-bold uppercase">{goal}</Text>
                             </View>
                         ))}
                     </View>
                 )}

                 {/* Detailed Interests */}
                 <View className="mb-4">
                     {item.detailed_interests && Object.keys(item.detailed_interests).length > 0 ? (
                         <View className="flex-row flex-wrap">
                             {Object.entries(item.detailed_interests).map(([category, details]) => (
                                 <View key={category} className="bg-white/10 px-3 py-1.5 rounded-lg mr-2 mb-2 border border-white/20">
                                     <Text className="text-white text-xs font-bold mb-0.5 opacity-70 uppercase">{category}</Text>
                                     {details && details.length > 0 ? (
                                         <Text className="text-white text-sm font-semibold">{details.join(', ')}</Text>
                                     ) : null}
                                 </View>
                             ))}
                         </View>
                     ) : null}
                 </View>

                 <Text className="text-white text-base mb-6 shadow-sm font-medium" numberOfLines={3}>{item.bio}</Text>

                 <View className="flex-row justify-between items-center">
                     <View className="flex-row items-center bg-black/60 px-3 py-2 rounded-lg backdrop-blur-md">
                         <IconSymbol name="location.fill" size={16} color="white" />
                         <Text className="text-white ml-2 font-bold">{Math.round(item.dist_meters)}m away</Text>
                     </View>

                     <TouchableOpacity 
                        className="bg-white px-8 py-3 rounded-full shadow-lg"
                        onPress={() => sendInterest(item.id)}
                     >
                         <Text className="text-black font-bold text-lg">Connect</Text>
                     </TouchableOpacity>
                 </View>
             </View>
         </View>
     );
  };

  return (
    <View className="flex-1 bg-black">
        {loading && !refreshing && feed.length === 0 && (
            <View className="absolute inset-0 z-10 justify-center items-center">
                <ActivityIndicator size="large" color="white" />
            </View>
        )}
        
        <FlatList
            data={feed}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            viewabilityConfig={{
                itemVisiblePercentThreshold: 50
            }}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
            }
        />
    </View>
  );
}

function FeedImage({ path, style }: { path: string | null, style: any }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
      
    }, [path]);
  
    if (!url) return <View style={style} className="bg-gray-800" />;
  
    return (
      <Image 
        source={url} 
        style={style} 
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk" 
      />
    );
}
