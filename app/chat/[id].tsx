import { IconSymbol } from '@/components/ui/icon-symbol';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type SocialLinks = {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    linkedin?: string;
    x?: string;
};

type ChatPartner = {
    full_name: string;
    avatar_url: string | null;
    social_links: SocialLinks | null;
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams(); // This is the Conversation ID (Interests ID)
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<ChatPartner | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();

  useEffect(() => {
    if (id && user) {
        fetchMessages();
        fetchPartnerInfo();

        const channel = supabase
            .channel(`chat:${id}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `conversation_id=eq.${id}`
            }, (payload) => {
                setMessages(prev => [...prev, payload.new as Message]);
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
  }, [id, user]);

  async function fetchPartnerInfo() {
      // First get the interest record to find the other user ID
      const { data: interest } = await supabase
        .from('interests')
        .select('sender_id, receiver_id')
        .eq('id', id)
        .single();
      
      if (interest) {
          const partnerId = interest.sender_id === user?.id ? interest.receiver_id : interest.sender_id;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url, social_links')
            .eq('id', partnerId)
            .single();
          
          if (profile) setPartner(profile);
      }
  }

  async function fetchMessages() {
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (data) setMessages(data);
    setLoading(false);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user) return;

    const { error } = await supabase
      .from('messages')
      .insert({
          conversation_id: id,
          sender_id: user.id,
          content: newMessage.trim()
      });

    if (error) {
        Alert.alert('Error', error.message);
    } else {
        setNewMessage('');
    }
  }

  const openLink = (url: string) => {
      Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const getSocialUrl = (platform: string, handle: string) => {
      if (handle.startsWith('http')) return handle;
      switch (platform) {
          case 'instagram': return `https://instagram.com/${handle.replace('@', '')}`;
          case 'tiktok': return `https://tiktok.com/@${handle.replace('@', '')}`;
          case 'x': return `https://x.com/${handle.replace('@', '')}`;
          default: return handle;
      }
  };

  return (
    <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-white"
    >
      {/* Header */}
      <View className="px-4 pt-12 pb-4 border-b border-gray-100 flex-row items-center bg-white shadow-sm z-10">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
              <IconSymbol name="chevron.left" size={24} color="black" />
          </TouchableOpacity>
          
          {partner && (
             <View className="flex-1 flex-row justify-between items-center">
                 <View className="flex-row items-center">
                    <View className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                        <ChatAvatar path={partner.avatar_url} />
                    </View>
                    <View>
                        <Text className="font-bold text-lg">{partner.full_name}</Text>
                        
                        {/* Social Links Mini-Bar */}
                        {partner.social_links && Object.keys(partner.social_links).length > 0 && (
                            <View className="flex-row mt-1 space-x-2">
                                {Object.entries(partner.social_links).map(([platform, handle]) => {
                                    if (!handle) return null;
                                    return (
                                        <TouchableOpacity 
                                            key={platform} 
                                            onPress={() => openLink(getSocialUrl(platform, handle))}
                                            className="bg-gray-100 px-1.5 py-0.5 rounded"
                                        >
                                            <Text className="text-[10px] font-bold uppercase text-gray-600">{platform.substring(0, 2)}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                 </View>
             </View>
          )}
      </View>

      <ScrollView 
        ref={scrollViewRef}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 20 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            return (
                <View 
                    key={msg.id} 
                    className={`mb-4 max-w-[80%] p-3 rounded-2xl ${
                        isMe ? 'bg-black self-end rounded-br-none' : 'bg-gray-100 self-start rounded-bl-none'
                    }`}
                >
                    <Text className={isMe ? 'text-white' : 'text-black'}>{msg.content}</Text>
                </View>
            );
        })}
      </ScrollView>

      <View className="p-4 border-t border-gray-100 pb-8">
          <View className="flex-row items-center bg-gray-50 rounded-full px-4 border border-gray-200">
              <TextInput
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type a message..."
                  className="flex-1 py-3 text-base"
                  onSubmitEditing={sendMessage}
              />
              <TouchableOpacity onPress={sendMessage} disabled={!newMessage.trim()}>
                  <Text className={`font-bold ${newMessage.trim() ? 'text-blue-600' : 'text-gray-400'}`}>Send</Text>
              </TouchableOpacity>
          </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatAvatar({ path }: { path: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
  
    useEffect(() => {
      if (!path) return;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setUrl(data.publicUrl);
    }, [path]);
  
    if (!url) return <View className="w-full h-full bg-gray-200" />;
  
    return (
      <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    );
}
