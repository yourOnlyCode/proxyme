import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import Avatar from '@/components/profile/Avatar';
import { getUserConnectionsList, removeConnection } from '@/lib/connections';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ConnectedUser = {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    relationship_goals: string[];
    bio: string;
    is_verified: boolean;
};

type ConnectionItem = ConnectedUser & {
    conversation_id?: string | null;
};

export default function UserConnectionsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const scheme = useColorScheme() ?? 'light';
    const isDark = scheme === 'dark';
    
    const [connections, setConnections] = useState<ConnectionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'All' | 'Romance' | 'Friendship' | 'Professional'>('All');
    
    const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        if (id) fetchConnections();
    }, [id, filter]);

    const fetchConnections = async () => {
        setLoading(true);
        try {
            const isSelf = !!user?.id && user.id === id;
            const list = await getUserConnectionsList({
                targetUserId: id,
                filterIntent: filter === 'All' ? null : filter,
            });

            // If viewing your own connections, fetch conversation ids (interest ids) so we can message/remove.
            if (isSelf) {
                const partnerIds = (list || []).map((p: any) => p.id).filter(Boolean);
                const convoMap = new Map<string, string>();
                if (partnerIds.length > 0) {
                    const { data: rows, error } = await supabase
                        .from('interests')
                        .select('id, sender_id, receiver_id, status')
                        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
                        .eq('status', 'accepted');
                    if (!error && rows) {
                        for (const r of rows as any[]) {
                            const partnerId = r.sender_id === user!.id ? r.receiver_id : r.sender_id;
                            if (partnerId && partnerIds.includes(partnerId) && !convoMap.has(partnerId)) {
                                convoMap.set(partnerId, r.id);
                            }
                        }
                    }
                }

                setConnections(
                    (list as any[]).map((p: any) => ({
                        ...p,
                        conversation_id: convoMap.get(p.id) || null,
                    }))
                );
            } else {
                setConnections(list as any);
            }
        } catch (error) {
            console.error('Error fetching connections:', error);
            setConnections([]);
        }
        setLoading(false);
    };

    const openProfile = (profile: ConnectedUser) => {
        fetchFullProfile(profile.id);
    };

    const fetchFullProfile = async (userId: string) => {
        const { data } = await supabase
            .from('profiles')
            .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
            .eq('id', userId)
            .single();
        if (data) {
            setSelectedProfile(data);
            setModalVisible(true);
        }
    };

    const renderItem = ({ item }: { item: ConnectionItem }) => {
        const isSelf = !!user?.id && user.id === id;
        const canMessage = isSelf && !!item.conversation_id;

        return (
            <View
              className="flex-row items-center bg-white p-4 rounded-2xl mb-3 shadow-sm border border-gray-100"
              style={{
                backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
              }}
            >
                <TouchableOpacity className="flex-row items-center flex-1" onPress={() => openProfile(item)} activeOpacity={0.85}>
                    <View className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 border border-gray-100">
                        <Avatar url={item.avatar_url || null} size={48} onUpload={() => {}} editable={false} />
                    </View>
                    <View className="ml-3 flex-1 pr-2">
                        <View className="flex-row items-center">
                            <Text className="font-bold text-lg text-ink mr-1" style={{ color: isDark ? '#E5E7EB' : undefined }}>
                              {item.full_name || item.username}
                            </Text>
                            {!!item.is_verified && <IconSymbol name="checkmark.seal.fill" size={14} color="#3B82F6" />}
                        </View>
                        <Text className="text-gray-500 text-sm" style={{ color: isDark ? 'rgba(226,232,240,0.65)' : undefined }}>
                          @{item.username}
                        </Text>

                        {/* Goal Badges */}
                        <View className="flex-row mt-1 flex-wrap">
                            {(item.relationship_goals || []).slice(0, 2).map((g, i) => (
                                <View
                                  key={i}
                                  className="bg-gray-100 px-2 py-0.5 rounded mr-1"
                                  style={{ backgroundColor: isDark ? 'rgba(15,23,42,0.65)' : undefined }}
                                >
                                    <Text className="text-[10px] text-gray-600 font-bold uppercase" style={{ color: isDark ? 'rgba(226,232,240,0.75)' : undefined }}>
                                      {g}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>

                {isSelf && (
                    <View className="flex-row items-center">
                        <TouchableOpacity
                            className={`p-3 rounded-full mr-2 ${canMessage ? 'bg-blue-50' : 'bg-gray-100'}`}
                            disabled={!canMessage}
                            onPress={() => {
                                if (item.conversation_id) router.push(`/chat/${item.conversation_id}`);
                            }}
                        >
                            <IconSymbol name="message.fill" size={18} color={canMessage ? '#2563EB' : '#9CA3AF'} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="p-3 rounded-full bg-red-50"
                            onPress={() => {
                                Alert.alert('Remove connection?', 'This will disconnect you and remove the chat thread from your inbox.', [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Remove',
                                        style: 'destructive',
                                        onPress: async () => {
                                            try {
                                                await removeConnection({ partnerId: item.id });
                                                await fetchConnections();
                                            } catch (e: any) {
                                                Alert.alert('Error', e?.message || 'Could not remove connection.');
                                            }
                                        }
                                    }
                                ]);
                            }}
                        >
                            <IconSymbol name="xmark" size={18} color="#DC2626" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View className="flex-1 bg-paper" style={{ backgroundColor: isDark ? '#0B1220' : undefined }}>
            {/* Custom Header (centered title) */}
            <View
                className="px-4 flex-row items-center justify-between bg-paper"
                style={{ paddingTop: insets.top + 12, paddingBottom: 12, backgroundColor: isDark ? '#0B1220' : undefined }}
            >
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full active:bg-gray-100">
                    <IconSymbol name="chevron.left" size={26} color={isDark ? '#E5E7EB' : '#1A202C'} />
                </TouchableOpacity>
                <Text
                    className="text-xl text-ink"
                    style={{ fontFamily: 'LibertinusSans-Regular', color: isDark ? '#E5E7EB' : undefined }}
                >
                    Connections
                </Text>
                <View className="w-10" />
            </View>

            {/* Filter Tabs */}
            <View
              className="flex-row mb-6 bg-gray-100 p-1 rounded-xl mx-4"
              style={{
                backgroundColor: isDark ? 'rgba(2,6,23,0.55)' : undefined,
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? 'rgba(148,163,184,0.18)' : undefined,
              }}
            >
                {['All', 'Romance', 'Friendship', 'Professional'].map((t) => (
                    <TouchableOpacity 
                        key={t}
                        onPress={() => setFilter(t as any)}
                        className={`flex-1 py-2 rounded-lg items-center ${filter === t ? 'bg-white shadow-sm' : ''}`}
                        style={{ backgroundColor: filter === t ? (isDark ? 'rgba(15,23,42,0.85)' : undefined) : undefined }}
                    >
                        <Text
                          className={`text-xs font-bold ${filter === t ? 'text-ink' : 'text-gray-500'}`}
                          style={{ color: filter === t ? (isDark ? '#E5E7EB' : undefined) : (isDark ? 'rgba(226,232,240,0.65)' : undefined) }}
                        >
                          {t}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={connections}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
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
                onStateChange={() => {
                    // Refresh connections
                }}
            />
        </View>
    );
}
