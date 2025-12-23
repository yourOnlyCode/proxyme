import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, Alert, Modal } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { ProfileModal } from '@/components/ProfileModal';

type ClubDetail = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  city: string;
  owner_id: string;
};

type ClubMember = {
  id: string; // member id
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'accepted' | 'invited' | 'pending';
  profile: {
      username: string;
      full_name: string;
      avatar_url: string | null;
  }
};

type Message = {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    sender: {
        username: string;
        avatar_url: string | null;
    }
};

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [memberStatus, setMemberStatus] = useState<'accepted' | 'invited' | 'pending' | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');
  
  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Members State
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (id && user) {
        fetchClubDetails();
        fetchMembership();
    }
  }, [id, user]);

  const fetchClubDetails = async () => {
      const { data, error } = await supabase.from('clubs').select('*').eq('id', id).single();
      if (data) setClub(data);
      else console.error(error);
  };

  const fetchMembership = async () => {
      const { data } = await supabase
        .from('club_members')
        .select('status, role')
        .eq('club_id', id)
        .eq('user_id', user!.id)
        .maybeSingle(); // Use maybeSingle to avoid error if row missing
      
      if (data) {
          setMemberStatus(data.status);
          setRole(data.role);
          if (data.status === 'accepted') {
              fetchMessages();
              fetchMembers();
              subscribeToChat();
          }
      }
      setLoading(false);
  };

  const fetchMessages = async () => {
      const { data } = await supabase
        .from('club_messages')
        .select(`
            id, content, created_at, sender_id,
            sender:profiles!sender_id (username, avatar_url)
        `)
        .eq('club_id', id)
        .order('created_at', { ascending: true });
      
      if (data) setMessages(data as any);
  };

  const fetchMembers = async () => {
      const { data } = await supabase
        .from('club_members')
        .select(`
            id, user_id, role, status,
            profile:profiles!user_id (username, full_name, avatar_url)
        `)
        .eq('club_id', id)
        .eq('status', 'accepted');
      
      if (data) setMembers(data as any);
  };

  const subscribeToChat = () => {
      const sub = supabase
        .channel(`club-chat-${id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'club_messages',
            filter: `club_id=eq.${id}`
        }, async (payload) => {
            // Fetch sender details for the new message
            const { data } = await supabase
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', payload.new.sender_id)
                .single();
            
            const newMsg = {
                ...payload.new,
                sender: data
            } as Message;

            setMessages(prev => [...prev, newMsg]);
        })
        .subscribe();
        
      return () => { supabase.removeChannel(sub); };
  };

  const sendMessage = async () => {
      if (!newMessage.trim() || !user) return;
      const content = newMessage.trim();
      setNewMessage('');

      const { error } = await supabase.from('club_messages').insert({
          club_id: id,
          sender_id: user.id,
          content: content
      });

      if (error) Alert.alert('Error', error.message);
  };

  const handleAcceptInvite = async () => {
      const { error } = await supabase
        .from('club_members')
        .update({ status: 'accepted' })
        .eq('club_id', id)
        .eq('user_id', user!.id);
      
      if (error) Alert.alert('Error', error.message);
      else {
          setMemberStatus('accepted');
          fetchMembership(); // Refresh to load chat
      }
  };

  const searchUsers = async (query: string) => {
      if (query.length < 3) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .ilike('username', `%${query}%`)
        .limit(10);
      
      // Filter out existing members
      const memberIds = new Set(members.map(m => m.user_id));
      const filtered = (data || []).filter(u => !memberIds.has(u.id));
      setSearchResults(filtered);
  };

  const inviteUser = async (userId: string) => {
      const { error } = await supabase
        .from('club_members')
        .insert({
            club_id: id,
            user_id: userId,
            role: 'member',
            status: 'invited'
        });
      
      if (error) Alert.alert('Error', error.message);
      else {
          Alert.alert('Invited!', 'User has been invited.');
          setInviteModalVisible(false);
      }
  };

  if (loading) return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator /></View>;
  if (!club) return <View className="flex-1 bg-white items-center justify-center"><Text>Club not found</Text></View>;

  const isMember = memberStatus === 'accepted';
  const isAdmin = role === 'admin' || role === 'owner';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-gray-50">
        {/* Header */}
        <View className="h-48 bg-gray-900 relative">
            <ClubImage path={club.image_url} />
            <View className="absolute inset-0 bg-black/40" />
            <TouchableOpacity onPress={() => router.back()} className="absolute top-12 left-4 p-2 bg-white/20 rounded-full backdrop-blur-md">
                <IconSymbol name="arrow.left" size={24} color="white" />
            </TouchableOpacity>
            <View className="absolute bottom-4 left-4 right-4">
                <Text className="text-white text-2xl font-bold">{club.name}</Text>
                <View className="flex-row items-center">
                    <IconSymbol name="location.fill" size={14} color="#E5E7EB" />
                    <Text className="text-gray-200 ml-1 font-semibold">{club.city}</Text>
                </View>
            </View>
        </View>

        {/* Access Control View */}
        {!isMember ? (
            <View className="flex-1 p-6 items-center">
                <Text className="text-gray-600 text-center mb-6 text-lg">{club.description || 'No description provided.'}</Text>
                
                <IconSymbol name="lock.fill" size={64} color="#CBD5E0" />
                <Text className="text-xl font-bold mt-4 mb-2 text-ink">Private Club</Text>
                <Text className="text-gray-500 text-center mb-8">This club is invite only. You must be invited by an admin to join.</Text>

                {memberStatus === 'invited' && (
                    <TouchableOpacity 
                        onPress={handleAcceptInvite}
                        className="bg-black py-4 px-8 rounded-xl shadow-lg w-full items-center"
                    >
                        <Text className="text-white font-bold text-lg">Accept Invite</Text>
                    </TouchableOpacity>
                )}
            </View>
        ) : (
            <>
                {/* Tabs */}
                <View className="flex-row bg-white border-b border-gray-200">
                    <TouchableOpacity 
                        onPress={() => setActiveTab('chat')}
                        className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'chat' ? 'border-black' : 'border-transparent'}`}
                    >
                        <Text className={`font-bold ${activeTab === 'chat' ? 'text-black' : 'text-gray-400'}`}>Chat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setActiveTab('members')}
                        className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'members' ? 'border-black' : 'border-transparent'}`}
                    >
                        <Text className={`font-bold ${activeTab === 'members' ? 'text-black' : 'text-gray-400'}`}>Members</Text>
                    </TouchableOpacity>
                </View>

                {activeTab === 'chat' ? (
                    <>
                        <ScrollView 
                            ref={scrollViewRef}
                            className="flex-1 px-4"
                            contentContainerStyle={{ paddingVertical: 16 }}
                            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                        >
                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                const showAvatar = idx === 0 || messages[idx-1].sender_id !== msg.sender_id;
                                return (
                                    <View key={msg.id} className={`flex-row mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        {!isMe && (
                                            <View className="w-8 h-8 mr-2">
                                                {showAvatar ? <Avatar path={msg.sender.avatar_url} /> : <View className="w-8" />}
                                            </View>
                                        )}
                                        <View>
                                            {!isMe && showAvatar && (
                                                <Text className="text-xs text-gray-500 ml-1 mb-0.5">{msg.sender.username}</Text>
                                            )}
                                            <View className={`px-4 py-2 rounded-2xl max-w-[240] ${
                                                isMe ? 'bg-blue-600 rounded-tr-sm' : 'bg-white border border-gray-200 rounded-tl-sm'
                                            }`}>
                                                <Text className={isMe ? 'text-white' : 'text-ink'}>{msg.content}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <View className="p-4 bg-white border-t border-gray-100 pb-8">
                            <View className="flex-row items-center bg-gray-50 rounded-full px-4 border border-gray-200">
                                <TextInput
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                    placeholder="Message club..."
                                    className="flex-1 py-3"
                                    onSubmitEditing={sendMessage}
                                />
                                <TouchableOpacity onPress={sendMessage} disabled={!newMessage.trim()}>
                                    <IconSymbol name="paperplane.fill" size={20} color={newMessage.trim() ? '#2563EB' : '#9CA3AF'} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                ) : (
                    <View className="flex-1">
                        <View className="p-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
                            <Text className="font-bold text-gray-500">{members.length} Members</Text>
                            {isAdmin && (
                                <TouchableOpacity 
                                    onPress={() => setInviteModalVisible(true)}
                                    className="bg-black px-4 py-2 rounded-full"
                                >
                                    <Text className="text-white text-xs font-bold">Invite Member</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <FlatList
                            data={members}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => (
                                <View className="flex-row items-center p-4 bg-white border-b border-gray-50">
                                    <View className="w-10 h-10 mr-3 rounded-full overflow-hidden">
                                        <Avatar path={item.profile.avatar_url} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-ink">{item.profile.full_name || item.profile.username}</Text>
                                        <Text className="text-gray-500 text-xs">@{item.profile.username}</Text>
                                    </View>
                                    <View className={`px-2 py-1 rounded text-xs ${
                                        item.role === 'owner' ? 'bg-purple-100' : item.role === 'admin' ? 'bg-blue-100' : 'bg-gray-100'
                                    }`}>
                                        <Text className={`text-[10px] font-bold uppercase ${
                                            item.role === 'owner' ? 'text-purple-700' : item.role === 'admin' ? 'text-blue-700' : 'text-gray-500'
                                        }`}>{item.role}</Text>
                                    </View>
                                </View>
                            )}
                        />
                    </View>
                )}
            </>
        )}

        {/* Invite Modal */}
        <Modal
            visible={inviteModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setInviteModalVisible(false)}
        >
            <View className="flex-1 bg-white p-6">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold">Invite Members</Text>
                    <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
                        <Text className="text-gray-500">Close</Text>
                    </TouchableOpacity>
                </View>

                <TextInput
                    value={searchQuery}
                    onChangeText={(text) => {
                        setSearchQuery(text);
                        searchUsers(text);
                    }}
                    placeholder="Search by username..."
                    className="bg-gray-100 p-4 rounded-xl mb-4"
                    autoCapitalize="none"
                />

                <FlatList
                    data={searchResults}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <View className="flex-row items-center justify-between py-3 border-b border-gray-50">
                            <View className="flex-row items-center">
                                <View className="w-8 h-8 mr-2 rounded-full overflow-hidden">
                                    <Avatar path={item.avatar_url} />
                                </View>
                                <Text className="font-bold">{item.username}</Text>
                            </View>
                            <TouchableOpacity 
                                onPress={() => inviteUser(item.id)}
                                className="bg-black px-3 py-1.5 rounded-lg"
                            >
                                <Text className="text-white text-xs font-bold">Invite</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            </View>
        </Modal>
    </KeyboardAvoidingView>
  );
}

function ClubImage({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        supabase.storage.from('avatars').getPublicUrl(path).then(({ data }) => {
            setUrl(data.publicUrl);
        });
    }, [path]);

    if (!url) return <View className="w-full h-full bg-gray-300" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

function Avatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!path) return;
        supabase.storage.from('avatars').getPublicUrl(path).then(({ data }) => {
            setUrl(data.publicUrl);
        });
    }, [path]);

    if (!url) return <View className="w-full h-full bg-gray-200" />;
    return <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" />;
}

