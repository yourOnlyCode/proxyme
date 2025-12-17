import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

type Interest = {
  id: string;
  sender: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

type Connection = {
  id: string; // connection id (interest id)
  peer: {
    id: string;
    username: string;
    avatar_url: string | null;
    full_name: string | null;
  };
};

export default function InterestsScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'incoming' | 'connections'>('incoming');
  const [incoming, setIncoming] = useState<Interest[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) fetchData();
  }, [user, activeTab]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    if (activeTab === 'incoming') {
      const { data, error } = await supabase
        .from('interests')
        .select(`
          id,
          status,
          created_at,
          sender:sender_id (id, username, avatar_url)
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
        
        if (data) setIncoming(data as any); // Cast because Supabase types can be tricky with joins
    } else {
      // Fetch Accepted Connections
      // We need to check both where we are sender AND where we are receiver
      const { data: sentData } = await supabase
        .from('interests')
        .select(`id, peer:receiver_id (id, username, avatar_url, full_name)`)
        .eq('sender_id', user.id)
        .eq('status', 'accepted');

      const { data: receivedData } = await supabase
        .from('interests')
        .select(`id, peer:sender_id (id, username, avatar_url, full_name)`)
        .eq('receiver_id', user.id)
        .eq('status', 'accepted');

      const combined = [...(sentData || []), ...(receivedData || [])];
      setConnections(combined as any);
    }
    setLoading(false);
  };

  const handleResponse = async (interestId: string, response: 'accepted' | 'declined') => {
    const { error } = await supabase
      .from('interests')
      .update({ status: response })
      .eq('id', interestId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      // Remove from list
      setIncoming(prev => prev.filter(i => i.id !== interestId));
      if (response === 'accepted') {
        Alert.alert('Connected!', 'You can now chat with this user.');
        setActiveTab('connections'); // Switch tab to see new connection
      }
    }
  };

  const renderIncoming = ({ item }: { item: Interest }) => (
    <View className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
      <View className="flex-row items-center flex-1">
        <Avatar path={item.sender.avatar_url} />
        <View className="ml-3">
            <Text className="font-bold text-lg">{item.sender.username}</Text>
            <Text className="text-gray-500 text-xs">Sent interest</Text>
        </View>
      </View>
      <View className="flex-row">
        <TouchableOpacity 
            className="bg-gray-200 px-4 py-2 rounded-lg mr-2"
            onPress={() => handleResponse(item.id, 'declined')}
        >
            <Text className="font-semibold">Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            className="bg-black px-4 py-2 rounded-lg"
            onPress={() => handleResponse(item.id, 'accepted')}
        >
            <Text className="text-white font-semibold">Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConnection = ({ item }: { item: Connection }) => (
    <TouchableOpacity 
        className="flex-row items-center bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100"
        onPress={() => router.push({
          pathname: "/chat/[id]",
          params: { id: item.id, username: item.peer.username }
        })}
    >
      <Avatar path={item.peer.avatar_url} />
      <View className="ml-3 flex-1">
          <Text className="font-bold text-lg">{item.peer.username}</Text>
          <Text className="text-gray-500">{item.peer.full_name}</Text>
      </View>
      <View className="bg-gray-100 px-3 py-1 rounded-full">
          <Text className="text-xs font-bold text-gray-600">Chat</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-gray-50 pt-12 px-4">
      <Text className="text-3xl font-bold mb-6">Inbox</Text>

      <View className="flex-row mb-6 bg-gray-200 p-1 rounded-lg">
        <TouchableOpacity 
            className={`flex-1 py-2 rounded-md items-center ${activeTab === 'incoming' ? 'bg-white shadow-sm' : ''}`}
            onPress={() => setActiveTab('incoming')}
        >
            <Text className={`font-semibold ${activeTab === 'incoming' ? 'text-black' : 'text-gray-500'}`}>Requests</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            className={`flex-1 py-2 rounded-md items-center ${activeTab === 'connections' ? 'bg-white shadow-sm' : ''}`}
            onPress={() => setActiveTab('connections')}
        >
            <Text className={`font-semibold ${activeTab === 'connections' ? 'text-black' : 'text-gray-500'}`}>Connections</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'incoming' ? incoming : connections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        renderItem={activeTab === 'incoming' ? renderIncoming as any : renderConnection as any}
        ListEmptyComponent={
            <View className="items-center mt-10">
                <Text className="text-gray-400 text-lg">
                    {activeTab === 'incoming' ? 'No new requests.' : 'No connections yet.'}
                </Text>
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
