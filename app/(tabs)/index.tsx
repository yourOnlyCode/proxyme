import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

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

const MICRO_RANGE = 100; // 100 meters for "Building"

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const { isProxyActive, toggleProxy, location } = useProxyLocation();
  const [feed, setFeed] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchProxyFeed = async () => {
    if (!user || !location || !isProxyActive) return;

    setLoading(true);

    const { data, error } = await supabase.rpc('get_feed_users', {
      lat: location.coords.latitude,
      long: location.coords.longitude,
      range_meters: MICRO_RANGE
    });

    if (error) {
      console.error('Error fetching proxy:', error);
    } else {
      setFeed(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isProxyActive && location) {
      fetchProxyFeed();

      const subscription = supabase
        .channel('public:profiles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          (payload) => {
            fetchProxyFeed(); 
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    } else {
      setFeed([]);
    }
  }, [isProxyActive, location]);

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
              setFeed(prev => prev.filter(p => p.id !== targetUserId));
          });
      }
  };

  const renderCard = ({ item }: { item: FeedProfile }) => {
    const topInterests: string[] = [];
    if (item.detailed_interests) {
        Object.entries(item.detailed_interests).forEach(([cat, details]) => {
            if (details.length > 0) {
                topInterests.push(`${cat}: ${details[0]}`); 
            } else {
                topInterests.push(cat);
            }
        });
    }

    return (
      <View className="bg-white rounded-xl mb-3 shadow-sm p-4 border border-gray-100 flex-row items-start relative">
        {/* Safety Options */}
        <TouchableOpacity 
            className="absolute top-2 right-2 p-2 z-10"
            onPress={() => handleSafety(item.id)}
        >
            <IconSymbol name="ellipsis" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <View className="h-16 w-16 bg-gray-200 rounded-full overflow-hidden mr-4 mt-1">
            <FeedImage path={item.avatar_url} />
        </View>

        <View className="flex-1 pr-6">
            <View className="flex-row justify-between items-start">
                <Text className="text-lg font-bold">{item.full_name || item.username}</Text>
            </View>
            {item.shared_interests_count > 0 && (
                <View className="bg-blue-100 px-2 py-0.5 rounded self-start mb-1">
                    <Text className="text-blue-700 text-xs font-bold">
                        {item.shared_interests_count} Matches
                    </Text>
                </View>
            )}
            
            {/* Relationship Goals Badges */}
            {item.relationship_goals && item.relationship_goals.length > 0 && (
                <View className="flex-row flex-wrap mt-1 mb-1">
                    {item.relationship_goals.map((goal, idx) => (
                        <View key={idx} className="bg-purple-100 px-1.5 py-0.5 rounded mr-1 mb-1">
                            <Text className="text-purple-700 text-[10px] font-bold uppercase">{goal}</Text>
                        </View>
                    ))}
                </View>
            )}

            <View className="flex-row items-center mb-2">
                 <View className="bg-green-100 px-2 py-0.5 rounded mr-2">
                     <Text className="text-green-700 text-xs font-bold">HERE</Text>
                 </View>
                 <Text className="text-gray-500 text-xs">{Math.round(item.dist_meters)}m away</Text>
            </View>

            {/* Dynamic Prompt based on Looking For */}
            {item.relationship_goals && item.relationship_goals.length > 0 && (
                <Text className="text-gray-800 text-xs italic font-semibold mb-2">
                    {item.relationship_goals[0] === 'Romance' && "Break the ice! Send an interest."}
                    {item.relationship_goals[0] === 'Friendship' && "You have a lot in common!"}
                    {item.relationship_goals[0] === 'Business' && "Find fellow experts at the event!"}
                </Text>
            )}

            {topInterests.length > 0 && (
                <View className="flex-row flex-wrap">
                    {topInterests.slice(0, 3).map((tag, idx) => (
                        <View key={idx} className="bg-gray-100 px-2 py-1 rounded mr-1 mb-1 border border-gray-200">
                            <Text className="text-gray-600 text-xs">{tag}</Text>
                        </View>
                    ))}
                    {topInterests.length > 3 && (
                        <Text className="text-gray-400 text-xs mt-1">+{topInterests.length - 3} more</Text>
                    )}
                </View>
            )}
        </View>

        <TouchableOpacity 
            className="bg-black px-3 py-2 rounded-lg ml-2 self-center"
            onPress={() => sendInterest(item.id)}
        >
            <Text className="text-white font-bold text-xs">Connect</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-gray-50 pt-12 px-4">
      {/* Header */}
      <View className="mb-6 flex-row justify-between items-center">
        <Text className="text-3xl font-extrabold tracking-tight">Proxy</Text>
        <TouchableOpacity onPress={() => signOut()}>
            <Text className="text-red-500 font-medium">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Proxy Toggle Card */}
      <View className="bg-white p-6 rounded-2xl mb-6 shadow-sm border border-gray-100">
        <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xl font-bold">Proxy Mode</Text>
            <Switch 
                value={isProxyActive} 
                onValueChange={toggleProxy}
                trackColor={{ false: '#e2e8f0', true: '#000' }}
            />
        </View>
        <Text className="text-gray-500">
            {isProxyActive 
                ? "You are visible to people in this building." 
                : "Turn on to see who is here right now."}
        </Text>
      </View>

      <Text className="text-lg font-bold mb-4 ml-1">People Here Now</Text>

      {!isProxyActive ? (
        <View className="flex-1 items-center justify-center opacity-40">
            <Text className="text-6xl mb-4">📍</Text>
            <Text className="text-center font-semibold text-gray-500 text-lg">Proxy is Off</Text>
        </View>
      ) : (
        <FlatList
            data={feed}
            keyExtractor={(item) => item.id}
            refreshControl={
                <RefreshControl refreshing={loading} onRefresh={fetchProxyFeed} />
            }
            ListEmptyComponent={
                <View className="items-center mt-10">
                     <Text className="text-gray-400 text-lg">No one else has Proxy on here.</Text>
                     <Text className="text-gray-400 text-sm mt-2">Tell your friends to turn it on!</Text>
                </View>
            }
            renderItem={renderCard}
        />
      )}
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
  
    if (!url) return <View className="w-full h-full bg-gray-200" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}
