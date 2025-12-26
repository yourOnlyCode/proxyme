import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type Interest = {
  id: string;
  sender: {
    id: string;
    username: string;
    avatar_url: string | null;
    detailed_interests: Record<string, string[]> | null;
  };
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

export default function RequestsScreen() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<Interest[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [selectedInterestId, setSelectedInterestId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('interests')
      .select(`
        id,
        status,
        created_at,
        sender:sender_id (id, username, avatar_url, detailed_interests)
      `)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
      
    if (data) setIncoming(data as any);
    setLoading(false);
  };

  const openProfile = async (userId: string, interestId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) {
          const profileWithContext = {
              ...data,
              has_received_interest: true,
          };
          setSelectedProfile(profileWithContext as ProfileData);
          setSelectedInterestId(interestId);
          setModalVisible(true);
      } else {
          Alert.alert('Error', 'Could not load profile');
      }
  };

  const handleResponse = async (interestId: string, response: 'accepted' | 'declined') => {
    const { error } = await supabase
      .from('interests')
      .update({ status: response })
      .eq('id', interestId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setIncoming(prev => prev.filter(i => i.id !== interestId));
      if (response === 'accepted') {
        Alert.alert('Connected!', 'You can now chat with this user.');
        // Optionally navigate to connections or chat
      }
      setModalVisible(false);
    }
  };

  const renderIncoming = ({ item }: { item: Interest }) => {
      const interestsSummary = item.sender.detailed_interests 
          ? Object.entries(item.sender.detailed_interests)
              .slice(0, 3)
              .map(([cat, vals]) => vals && vals.length > 0 ? vals[0] : cat)
              .join(', ')
          : 'No interests listed';

      return (
        <View className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
          <TouchableOpacity 
            className="flex-row items-center flex-1"
            onPress={() => openProfile(item.sender.id, item.id)}
          >
            <Avatar path={item.sender.avatar_url} />
            <View className="ml-3 flex-1 pr-2">
                <Text className="font-bold text-lg">{item.sender.username}</Text>
                <Text className="text-gray-500 text-xs mb-1">Sent interest</Text>
                <Text className="text-xs text-business font-medium" numberOfLines={1}>
                    {interestsSummary}
                </Text>
            </View>
          </TouchableOpacity>
          
          <View className="flex-row items-center space-x-2">
            <TouchableOpacity 
                className="bg-gray-100 p-3 rounded-full mr-2"
                onPress={() => openProfile(item.sender.id, item.id)}
            >
                <IconSymbol name="eye.fill" size={20} color="#4A5568" />
            </TouchableOpacity>
    
            <TouchableOpacity 
                className="bg-red-50 p-3 rounded-full mr-2"
                onPress={() => handleResponse(item.id, 'declined')}
            >
                <IconSymbol name="xmark" size={20} color="#E53E3E" />
            </TouchableOpacity>
            
            <TouchableOpacity 
                className="bg-green-50 p-3 rounded-full"
                onPress={() => handleResponse(item.id, 'accepted')}
            >
                <IconSymbol name="checkmark" size={20} color="#38A169" />
            </TouchableOpacity>
          </View>
        </View>
      );
  };

  return (
    <View className="flex-1 bg-gray-50 pt-12 px-4">
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         onStateChange={() => {
             // Refresh requests list
         }}
      />
      
      <View className="flex-row justify-between items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
              <IconSymbol name="chevron.left" size={28} color="#1A1A1A" />
          </TouchableOpacity>
          <Text className="text-3xl font-bold flex-1 text-center pr-8">Requests</Text>
      </View>

      <FlatList
        data={incoming}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        renderItem={renderIncoming}
        ListEmptyComponent={
            <View className="items-center mt-10">
                <Text className="text-gray-400 text-lg">No new requests.</Text>
            </View>
        }
      />
    </View>
  );
}

function Avatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      supabase.storage.from('avatars').download(path).then(({ data }) => {
        if (data) {
          const fr = new FileReader();
          fr.readAsDataURL(data);
          fr.onload = () => setUrl(fr.result as string);
        }
      });
    }, [path]);
  
    return (
      <View className="w-12 h-12 bg-gray-300 rounded-full overflow-hidden">
         {url ? (
             <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />
         ) : (
             <View className="w-full h-full items-center justify-center bg-gray-200">
                 <Text className="text-gray-400 font-bold">?</Text>
             </View>
         )}
      </View>
    );
}

