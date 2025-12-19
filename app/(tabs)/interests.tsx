import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileModal, ProfileData } from '@/components/ProfileModal';

type Connection = {
  id: string; // connection id (interest id)
  peer: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
    last_seen: string | null;
    status_text: string | null; // NEW
    status_image_url: string | null; // NEW
  };
};

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: sentData } = await supabase
      .from('interests')
      .select(`id, peer:receiver_id (id, username, avatar_url, full_name, last_seen, status_text, status_image_url)`)
      .eq('sender_id', user.id)
      .eq('status', 'accepted');

    const { data: receivedData } = await supabase
      .from('interests')
      .select(`id, peer:sender_id (id, username, avatar_url, full_name, last_seen, status_text, status_image_url)`)
      .eq('receiver_id', user.id)
      .eq('status', 'accepted');

    let combined = [...(sentData || []), ...(receivedData || [])] as Connection[];
    
    // Sort by last_seen (descending)
    combined.sort((a, b) => {
        if (!a.peer.last_seen) return 1;
        if (!b.peer.last_seen) return -1;
        return new Date(b.peer.last_seen).getTime() - new Date(a.peer.last_seen).getTime();
    });

    setConnections(combined);
    setLoading(false);
  };

  const openProfile = async (userId: string, connectionId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) {
          const profileWithContext = {
              ...data,
              has_sent_interest: true, // We are connected
          };
          setSelectedProfile(profileWithContext as ProfileData);
          setSelectedConnectionId(connectionId);
          setModalVisible(true);
      } else {
          Alert.alert('Error', 'Could not load profile');
      }
  };

  const handleMessage = (connectionId: string, username: string) => {
      setModalVisible(false);
      router.push({
          pathname: "/chat/[id]",
          params: { id: connectionId, username: username }
      });
  };

  const renderConnection = ({ item }: { item: Connection }) => (
    <View className="flex-row items-center bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
      <TouchableOpacity 
        className="flex-row items-center flex-1"
        onPress={() => handleMessage(item.id, item.peer.username)}
      >
        <Avatar path={item.peer.avatar_url} />
        <View className="ml-3 flex-1">
            <View className="flex-row items-center">
                <Text className="font-bold text-lg mr-2">{item.peer.username}</Text>
                {item.peer.status_image_url && (
                    <View className="w-5 h-5 rounded overflow-hidden border border-gray-200">
                        {/* Reuse Avatar logic or specialized image? Reusing Avatar logic for now as it handles storage download */}
                        <Avatar path={item.peer.status_image_url} /> 
                    </View>
                )}
            </View>
            
            {item.peer.status_text ? (
                <Text className="text-ink italic text-sm" numberOfLines={1}>"{item.peer.status_text}"</Text>
            ) : (
                <Text className="text-gray-500">{item.peer.full_name}</Text>
            )}
        </View>
      </TouchableOpacity>

      <View className="flex-row items-center space-x-2">
           <TouchableOpacity 
                className="bg-gray-100 p-3 rounded-full mr-2"
                onPress={() => openProfile(item.peer.id, item.id)}
            >
                <IconSymbol name="eye.fill" size={20} color="#4A5568" />
            </TouchableOpacity>

          <TouchableOpacity 
              className="bg-gray-100 p-3 rounded-full"
              onPress={() => handleMessage(item.id, item.peer.username)}
          >
              <IconSymbol name="message.fill" size={20} color="#4A5568" />
          </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-gray-50 pt-12 px-4">
      <ProfileModal 
         visible={modalVisible}
         profile={selectedProfile}
         onClose={() => setModalVisible(false)}
         mode="connection"
         onMessage={() => selectedProfile && selectedConnectionId && handleMessage(selectedConnectionId, selectedProfile.username)}
      />
      
      <View className="flex-row justify-between items-center mb-6">
          <Text className="text-3xl font-bold">Connections</Text>
          <TouchableOpacity onPress={() => router.push('/requests')}>
              <IconSymbol name="tray.fill" size={28} color="#2D3748" />
          </TouchableOpacity>
      </View>

      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        renderItem={renderConnection}
        ListEmptyComponent={
            <View className="items-center mt-10">
                <Text className="text-gray-400 text-lg">No connections yet.</Text>
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
             <Image source={{ uri: url }} className="w-full h-full" />
         ) : (
             <View className="w-full h-full items-center justify-center bg-gray-200">
                 <Text className="text-gray-400 font-bold">?</Text>
             </View>
         )}
      </View>
    );
}
