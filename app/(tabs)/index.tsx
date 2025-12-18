import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, LayoutAnimation, Platform, RefreshControl, Switch, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { useProxyLocation } from '../../lib/location';
import { showSafetyOptions } from '../../lib/safety';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  is_verified: boolean;
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const getGoalColors = (goal?: string) => {
    switch(goal) {
        case 'Romance': return { bg: 'bg-romance/5', border: 'border-romance/30', text: 'text-romance', badgeBg: 'bg-romance/10' };
        case 'Friendship': return { bg: 'bg-friendship/5', border: 'border-friendship/30', text: 'text-friendship', badgeBg: 'bg-friendship/10' };
        case 'Business': return { bg: 'bg-business/5', border: 'border-business/30', text: 'text-business', badgeBg: 'bg-business/10' };
        default: return { bg: 'bg-white', border: 'border-gray-200', text: 'text-ink', badgeBg: 'bg-gray-100' };
    }
  };

  const renderCard = ({ item }: { item: FeedProfile }) => {
    const primaryGoal = item.relationship_goals?.[0];
    const colors = getGoalColors(primaryGoal);

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
      <View className={`rounded-2xl mb-4 p-4 border shadow-sm ${colors.bg} ${colors.border}`}>
        {/* Safety Options */}
        <TouchableOpacity 
            className="absolute top-3 right-3 p-2 z-10"
            onPress={() => handleSafety(item.id)}
        >
            <IconSymbol name="ellipsis" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <View className="flex-row">
            <View className="h-20 w-20 rounded-2xl overflow-hidden mr-4 shadow-sm border border-gray-100">
                <FeedImage path={item.avatar_url} />
            </View>

            <View className="flex-1 pr-6">
                <View className="flex-row items-center mb-1">
                    <Text className="text-xl font-bold text-ink mr-1">{item.full_name || item.username}</Text>
                    {item.is_verified && (
                        <IconSymbol name="checkmark.seal.fill" size={18} color="#3B82F6" />
                    )}
                </View>
                
                {/* Relationship Goal Badge */}
                {primaryGoal && (
                    <View className={`self-start px-2 py-0.5 rounded-full mb-2 ${colors.badgeBg}`}>
                        <Text className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>{primaryGoal}</Text>
                    </View>
                )}

                <View className="flex-row items-center mb-2">
                     <View className="bg-green-100 px-2 py-0.5 rounded mr-2">
                         <Text className="text-green-700 text-[10px] font-bold">HERE</Text>
                     </View>
                     <Text className="text-gray-500 text-xs font-medium">{Math.round(item.dist_meters)}m away</Text>
                     
                     {item.shared_interests_count > 0 && (
                        <View className="ml-2 bg-blue-50 px-2 py-0.5 rounded">
                            <Text className="text-blue-600 text-[10px] font-bold">
                                {item.shared_interests_count} Matches
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>

        {/* Dynamic Prompt based on Looking For */}
        {primaryGoal && (
            <View className="mt-2 mb-3">
                <Text className={`text-sm italic font-medium opacity-80 ${colors.text}`}>
                    "{primaryGoal === 'Romance' && "Break the ice! Send an interest."}
                    {primaryGoal === 'Friendship' && "You have a lot in common!"}
                    {primaryGoal === 'Business' && "Find fellow experts at the event!"}"
                </Text>
            </View>
        )}

        {/* Interests Tags */}
        {topInterests.length > 0 && (
            <View className="flex-row flex-wrap mt-1">
                {topInterests.slice(0, 3).map((tag, idx) => (
                    <View key={idx} className="bg-white/80 px-3 py-1.5 rounded-lg mr-2 mb-2 border border-gray-200/50 shadow-sm">
                        <Text className="text-ink text-xs font-medium">{tag}</Text>
                    </View>
                ))}
                {topInterests.length > 3 && (
                    <Text className="text-gray-400 text-xs mt-2 self-center">+{topInterests.length - 3} more</Text>
                )}
            </View>
        )}

        {/* Action Button */}
        <TouchableOpacity 
            className="mt-4 bg-ink py-3 rounded-xl items-center shadow-md active:opacity-90"
            onPress={() => sendInterest(item.id)}
        >
            <Text className="text-white font-bold text-sm tracking-wide">Connect</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-paper pt-12 px-4">
      {/* Header */}
      <View className="mb-6 flex-row justify-between items-center">
        <Image 
          source={require('../../assets/images/icon.png')}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={() => signOut()}>
            <Text className="text-romance font-bold opacity-80">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Proxy Toggle Card */}
      <View className="bg-white p-5 rounded-3xl mb-6 shadow-sm border border-gray-100/50">
        <View className="flex-row justify-between items-center mb-2">
            <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${isProxyActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <Text className="text-lg font-bold text-ink">Proxy Mode</Text>
            </View>
            <Switch 
                value={isProxyActive} 
                onValueChange={toggleProxy}
                trackColor={{ false: '#e2e8f0', true: '#2D3748' }}
                thumbColor={Platform.OS === 'ios' ? '#fff' : '#fff'}
            />
        </View>
        <Text className="text-gray-500 text-sm leading-5">
            {isProxyActive 
                ? "You are visible to others in this building." 
                : "Turn on to see who is here right now."}
        </Text>
      </View>

      <Text className="text-lg font-bold mb-4 ml-1 text-ink opacity-90">People Here Now</Text>

      {!isProxyActive ? (
        <View className="flex-1 items-center justify-center opacity-30">
            <IconSymbol name="location.slash.fill" size={64} color="#2D3748" />
            <Text className="text-center font-bold text-ink text-xl mt-4">Proxy is Off</Text>
            <Text className="text-center text-gray-500 text-sm mt-2">Flip the switch to connect.</Text>
        </View>
      ) : (
        <FlatList
            data={feed}
            keyExtractor={(item) => item.id}
            refreshControl={
                <RefreshControl refreshing={loading} onRefresh={fetchProxyFeed} tintColor="#2D3748" />
            }
            ListEmptyComponent={
                <View className="items-center mt-12 opacity-60">
                     <Text className="text-ink text-lg font-medium">No one else is here yet.</Text>
                     <Text className="text-gray-500 text-sm mt-2 text-center px-8">Be the first to break the ice! Tell your friends to turn on Proxy.</Text>
                </View>
            }
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
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
  
    if (!url) return <View className="w-full h-full bg-gray-100 animate-pulse" />;
  
    return (
      <Image 
        source={{ uri: url }} 
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    );
}
