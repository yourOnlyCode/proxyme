import { IconSymbol } from '@/components/ui/icon-symbol';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height - 90; // Adjust for tab bar height

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
  interests: string[] | null;
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
      range_meters: 30000 // 30km City Range
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

  const renderItem = ({ item }: { item: FeedProfile }) => {
     // Prepare photos array
     let displayPhotos: string[] = [];
     if (item.photos && item.photos.length > 0) {
         displayPhotos = item.photos.map(p => p.url);
     } else if (item.avatar_url) {
         displayPhotos = [item.avatar_url];
     }

     return (
         <View style={{ width, height: ITEM_HEIGHT }} className="bg-black relative">
             {/* Photo Carousel */}
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
             
             {/* Pagination Dots */}
             {displayPhotos.length > 1 && (
                 <View className="absolute top-10 left-0 right-0 flex-row justify-center space-x-2">
                     {displayPhotos.map((_, i) => (
                         <View key={i} className="w-16 h-1 bg-white/30 rounded-full mx-1" />
                     ))}
                 </View>
             )}

             {/* Gradient Overlay */}
             <View className="absolute bottom-0 left-0 right-0 h-1/2 bg-black/40" pointerEvents="none" />

             {/* Content Overlay */}
             <View className="absolute bottom-10 left-4 right-4">
                 <View className="flex-row items-center mb-2">
                     <Text className="text-white text-3xl font-bold mr-2">{item.full_name}</Text>
                     <Text className="text-gray-300 text-xl">@{item.username}</Text>
                 </View>

                 {/* Interests Tags */}
                 <View className="flex-row flex-wrap mb-3">
                     {item.interests?.map((tag) => (
                         <View key={tag} className="bg-white/20 px-3 py-1 rounded-full mr-2 mb-2">
                             <Text className="text-white text-sm font-semibold">{tag}</Text>
                         </View>
                     ))}
                 </View>

                 <Text className="text-white text-base mb-6 shadow-sm" numberOfLines={3}>{item.bio}</Text>

                 {/* Action Buttons */}
                 <View className="flex-row justify-between items-center">
                     <View className="flex-row items-center bg-black/50 px-3 py-1 rounded-lg">
                         <IconSymbol name="location.fill" size={16} color="white" />
                         <Text className="text-white ml-1">{Math.round(item.dist_meters)}m away</Text>
                     </View>

                     <TouchableOpacity 
                        className="bg-white px-6 py-3 rounded-full"
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
      
      // Get a signed URL or public URL from Supabase
      // For public buckets, we can construct the URL directly for caching
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
