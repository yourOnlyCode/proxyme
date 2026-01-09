import { ProfileData, ProfileModal } from '@/components/ProfileModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

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

type Conversation = {
  id: string;
  partner: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  last_message: {
    content: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count?: number;
  created_at?: string; // connection created_at fallback for sorting when no messages exist
};

type Notification = {
  id: string;
  type: 'forum_reply' | 'club_event' | 'club_member' | 'club_invite' | 'connection_request' | 'connection_accepted' | 'message';
  title: string;
  body: string;
  data: {
    club_id?: string;
    topic_id?: string;
    event_id?: string;
    member_id?: string;
    inviter_id?: string;
  } | null;
  read: boolean;
  created_at: string;
};

type InboxItem = {
  type: 'request' | 'message' | 'notification';
  id: string;
  request?: Interest;
  conversation?: Conversation;
  notification?: Notification;
  timestamp: string;
};

export default function InboxScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [selectedInterestId, setSelectedInterestId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      fetchData();

      // Subscribe to message and notification changes
      const subscription = supabase
        .channel('inbox-updates')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        }, () => {
          fetchData();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`
        }, () => {
          fetchData();
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [user]);

  // Refresh when screen comes into focus (e.g., returning from chat)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchData();
      }
    }, [user])
  );

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch pending requests + optimized conversations + notifications in parallel
      const [requestsResult, conversationsResult, notificationsResult] = await Promise.all([
        supabase
          .from('interests')
          .select(`
            id,
            status,
            created_at,
            sender:sender_id (id, username, avatar_url, detailed_interests)
          `)
          .eq('receiver_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_inbox_conversations'),
        supabase
          .from('notifications')
          .select('id, type, title, body, data, read, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50), // Limit to recent 50 notifications
      ]);

      const requestsData = requestsResult.data;
      const conversationsRows = (conversationsResult as any).data as any[] | null;
      const notificationsData = notificationsResult.data;

      const conversations: Conversation[] = (conversationsRows || []).map((row) => ({
        id: row.id,
        created_at: row.connection_created_at,
        partner: {
          id: row.partner_id,
          username: row.partner_username,
          avatar_url: row.partner_avatar_url,
        },
        last_message: row.last_message_created_at
          ? {
              content: row.last_message_content,
              created_at: row.last_message_created_at,
              sender_id: row.last_message_sender_id,
            }
          : null,
        unread_count: row.unread_count || 0,
      }));

      // Combine and sort by timestamp
      const inboxItems: InboxItem[] = [
        ...(requestsData || []).map((req: any) => ({
          type: 'request' as const,
          id: req.id,
          request: req,
          timestamp: req.created_at,
        })),
        ...conversations.map((conv) => ({
          type: 'message' as const,
          id: conv.id,
          conversation: conv,
          timestamp: conv.last_message?.created_at || conv.created_at || conv.partner.id,
        })),
        ...(notificationsData || []).map((notif: any) => ({
          type: 'notification' as const,
          id: notif.id,
          notification: notif,
          timestamp: notif.created_at,
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setItems(inboxItems);
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const openProfile = async (userId: string, interestId?: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, bio, avatar_url, detailed_interests, relationship_goals, is_verified, city, state, social_links, status_text, status_image_url, status_created_at')
      .eq('id', userId)
      .single();
    
    if (data) {
      const profileWithContext = {
        ...data,
        has_received_interest: !!interestId,
      };
      setSelectedProfile(profileWithContext as ProfileData);
      if (interestId) setSelectedInterestId(interestId);
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
      setItems(prev => prev.filter(i => i.id !== interestId));
      if (response === 'accepted') {
        Alert.alert('Connected!', 'You can now chat with this user.');
      }
      setModalVisible(false);
      fetchData(); // Refresh to show new conversation
    }
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    if (item.type === 'request' && item.request) {
      const interestsSummary = item.request.sender.detailed_interests 
        ? Object.entries(item.request.sender.detailed_interests)
            .slice(0, 3)
            .map(([cat, vals]) => vals && vals.length > 0 ? vals[0] : cat)
            .join(', ')
        : 'No interests listed';

      return (
        <View className="flex-row items-center justify-between bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
          <TouchableOpacity 
            className="flex-row items-center flex-1"
            onPress={() => openProfile(item.request!.sender.id, item.id)}
          >
            <View className="relative">
              <Avatar path={item.request.sender.avatar_url} />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className="font-bold text-lg mb-1">{item.request.sender.username}</Text>
              <Text className="text-gray-500 text-xs mb-1">Sent interest</Text>
              <Text className="text-xs text-business font-medium" numberOfLines={1}>
                {interestsSummary}
              </Text>
            </View>
          </TouchableOpacity>
          
          <View className="flex-row items-center space-x-2">
            <TouchableOpacity 
              className="bg-gray-100 p-3 rounded-full mr-2"
              onPress={() => openProfile(item.request!.sender.id, item.id)}
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
    }

    if (item.type === 'message' && item.conversation) {
      const isMyMessage = item.conversation.last_message?.sender_id === user?.id;
      const preview = item.conversation.last_message 
        ? (isMyMessage ? `You: ${item.conversation.last_message.content}` : item.conversation.last_message.content)
        : '';
      const unreadCount = Number(item.conversation?.unread_count || 0);

      return (
        <TouchableOpacity 
          className="flex-row items-center bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100"
          onPress={() => router.push(`/chat/${item.id}`)}
        >
          <View className="relative">
            <Avatar path={item.conversation.partner.avatar_url} />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5 border-2 border-white">
                <Text className="text-white text-[10px] font-bold">
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            )}
          </View>
          <View className="ml-3 flex-1 pr-2">
            <Text className="font-bold text-lg mb-1">{item.conversation.partner.username}</Text>
            <Text className="text-gray-500 text-sm" numberOfLines={1}>
              {preview}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      );
    }

    if (item.type === 'notification' && item.notification) {
      const notif = item.notification;
      const getNotificationIcon = () => {
        switch (notif.type) {
          case 'forum_reply':
            return { name: 'bubble.left.and.bubble.right.fill' as const, color: '#3B82F6' };
          case 'club_event':
            return { name: 'calendar.badge.plus' as const, color: '#10B981' };
          case 'club_member':
            return { name: 'person.badge.plus' as const, color: '#8B5CF6' };
          case 'club_invite':
            return { name: 'envelope.badge' as const, color: '#F59E0B' };
          default:
            return { name: 'bell.fill' as const, color: '#6B7280' };
        }
      };

      const icon = getNotificationIcon();

      const markNotificationRead = async () => {
        // Mark as read
        if (!notif.read) {
          await supabase
            .from('notifications')
            .update({ read: true, read_at: new Date().toISOString() })
            .eq('id', notif.id);
        }
      };

      const handleClubInviteResponse = async (response: 'accepted' | 'declined') => {
        if (!user?.id || !notif.data?.club_id) return;

        try {
          await markNotificationRead();

          if (response === 'accepted') {
            const { error } = await supabase
              .from('club_members')
              .update({ status: 'accepted' })
              .eq('club_id', notif.data.club_id)
              .eq('user_id', user.id);
            if (error) throw error;

            router.push(`/clubs/${notif.data.club_id}?tab=forum`);
          } else {
            // Decline = remove membership row (requires DELETE policy, added in SQL)
            const { error } = await supabase
              .from('club_members')
              .delete()
              .eq('club_id', notif.data.club_id)
              .eq('user_id', user.id);
            if (error) throw error;
          }

          fetchData();
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Could not update invite.');
        }
      };

      const handleNotificationPress = async () => {
        await markNotificationRead();

        // Navigate based on notification type
        if (notif.type === 'forum_reply' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=forum`);
        } else if (notif.type === 'club_event' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=events`);
        } else if (notif.type === 'club_member' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}?tab=members`);
        } else if (notif.type === 'club_invite' && notif.data?.club_id) {
          router.push(`/clubs/${notif.data.club_id}`);
        }

        fetchData(); // Refresh to update read status
      };

      return (
        <View
          className={`p-4 rounded-xl mb-3 shadow-sm border ${
            notif.read ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-200'
          }`}
        >
          <TouchableOpacity className="flex-row items-center" onPress={handleNotificationPress} activeOpacity={0.8}>
            <View
              className={`w-10 h-10 rounded-full items-center justify-center ${
                notif.read ? 'bg-gray-100' : 'bg-blue-100'
              }`}
            >
              <IconSymbol name={icon.name} size={20} color={icon.color} />
            </View>
            <View className="ml-3 flex-1 pr-2">
              <Text className={`font-bold text-base mb-1 ${notif.read ? 'text-gray-700' : 'text-gray-900'}`}>
                {notif.title}
              </Text>
              <Text className="text-gray-500 text-sm" numberOfLines={2}>
                {notif.body}
              </Text>
            </View>
            {!notif.read && <View className="w-2 h-2 bg-blue-500 rounded-full" />}
          </TouchableOpacity>

          {notif.type === 'club_invite' && notif.data?.club_id && (
            <View className="flex-row items-center justify-end mt-3">
              <TouchableOpacity
                className="bg-gray-100 px-4 py-2 rounded-full mr-2"
                onPress={() => router.push(`/clubs/${notif.data!.club_id}`)}
              >
                <Text className="text-gray-700 font-bold text-xs">View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-50 px-4 py-2 rounded-full mr-2"
                onPress={() => handleClubInviteResponse('declined')}
              >
                <Text className="text-red-600 font-bold text-xs">Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-green-50 px-4 py-2 rounded-full"
                onPress={() => handleClubInviteResponse('accepted')}
              >
                <Text className="text-green-700 font-bold text-xs">Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <View className="flex-1 bg-gray-50">
      <ProfileModal
        visible={modalVisible}
        profile={selectedProfile}
        onClose={() => setModalVisible(false)}
        onStateChange={() => {
            // Refresh inbox
            fetchData();
        }}
      />
      
      <View className="flex-row justify-between items-center mb-6 pt-12 px-4">
        <Text className="text-3xl font-bold flex-1 text-center">Inbox</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 mt-4">Loading inbox...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View className="items-center mt-10">
              <IconSymbol name="tray" size={48} color="#CBD5E0" />
              <Text className="text-gray-400 text-lg mt-4">Your inbox is empty.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function Avatar({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUrl(data.publicUrl);
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
