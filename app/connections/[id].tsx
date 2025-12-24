import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from 'react-native';

type ConnectedUser = {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    relationship_goals: string[];
    bio: string;
    is_verified: boolean;
};

export default function UserConnectionsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const router = useRouter();
    
    const [connections, setConnections] = useState<ConnectedUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'All' | 'Romance' | 'Friendship' | 'Professional'>('All');
    
    const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        if (id) fetchConnections();
    }, [id, filter]);

    const fetchConnections = async () => {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_user_connections_list', {
            target_user_id: id,
            filter_intent: filter === 'All' ? null : filter
        });

        if (error) {
            console.error('Error fetching connections:', error);
        } else {
            setConnections(data || []);
        }
        setLoading(false);
    };

    const openProfile = (profile: ConnectedUser) => {
        fetchFullProfile(profile.id);
    };

    const fetchFullProfile = async (userId: string) => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (data) {
            setSelectedProfile(data);
            setModalVisible(true);
        }
    };

    const renderItem = ({ item }: { item: ConnectedUser }) => (
        <TouchableOpacity 
            className="flex-row items-center bg-white p-4 rounded-2xl mb-3 shadow-sm border border-gray-100"
            onPress={() => openProfile(item)}
        >
            <View className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 border border-gray-100">
                <Avatar path={item.avatar_url} />
            </View>
            <View className="ml-3 flex-1">
                <View className="flex-row items-center">
                    <Text className="font-bold text-lg text-ink mr-1">{item.full_name || item.username}</Text>
                    {item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                </View>
                <Text className="text-gray-500 text-sm">@{item.username}</Text>
                
                {/* Goal Badges */}
                <View className="flex-row mt-1 flex-wrap">
                    {item.relationship_goals?.slice(0, 2).map((g, i) => (
                        <View key={i} className="bg-gray-100 px-2 py-0.5 rounded mr-1">
                            <Text className="text-[10px] text-gray-600 font-bold uppercase">{g}</Text>
                        </View>
                    ))}
                </View>
            </View>
            <IconSymbol name="chevron.right" size={16} color="#CBD5E0" />
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-paper pt-12 px-4">
            {/* Header */}
            <View className="flex-row items-center mb-6">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full active:bg-gray-100">
                    <IconSymbol name="arrow.left" size={24} color="#1A202C" />
                </TouchableOpacity>
                <Text className="text-2xl font-bold ml-2">Connections</Text>
            </View>

            {/* Filter Tabs */}
            <View className="flex-row mb-6 bg-gray-100 p-1 rounded-xl">
                {['All', 'Romance', 'Friendship', 'Professional'].map((t) => (
                    <TouchableOpacity 
                        key={t}
                        onPress={() => setFilter(t as any)}
                        className={`flex-1 py-2 rounded-lg items-center ${filter === t ? 'bg-white shadow-sm' : ''}`}
                    >
                        <Text className={`text-xs font-bold ${filter === t ? 'text-ink' : 'text-gray-500'}`}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={connections}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    !loading ? (
                        <View className="items-center mt-20 opacity-50">
                            <IconSymbol name="person.2.slash.fill" size={48} color="#CBD5E0" />
                            <Text className="text-gray-500 mt-4 font-medium">No connections found.</Text>
                        </View>
                    ) : (
                        <View className="mt-20">
                            <ActivityIndicator color="#000" />
                        </View>
                    )
                }
            />

            <ProfileModal 
                visible={modalVisible}
                profile={selectedProfile}
                onClose={() => setModalVisible(false)}
                mode="send_interest"
            />
        </View>
    );
}

function Avatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data) {
          setUrl(data.publicUrl);
      }
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

