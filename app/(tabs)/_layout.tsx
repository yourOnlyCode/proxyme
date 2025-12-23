import { StatusFloatingButton } from '@/components/StatusFloatingButton';
import { StatusProvider } from '@/components/StatusProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { useProxyLocation } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

export default function TabLayout() {
  const { address } = useProxyLocation();
  const { user } = useAuth();
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // Fetch pending requests count
  useEffect(() => {
    if (!user) return;

    const fetchPendingRequests = async () => {
      const { count } = await supabase
        .from('interests')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('status', 'pending');
      
      setPendingRequestsCount(count || 0);
    };

    fetchPendingRequests();

    // Subscribe to changes
    const subscription = supabase
      .channel('pending-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interests',
        filter: `receiver_id=eq.${user.id}`
      }, () => {
        fetchPendingRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  // Fetch unread messages count
  useEffect(() => {
    if (!user) return;

    const fetchUnreadMessages = async () => {
      // Check for unread messages in connections
      const { data: connections } = await supabase
        .from('interests')
        .select('id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (connections && connections.length > 0) {
        const connectionIds = connections.map(c => c.id);
        
        // Count unread messages (messages sent by others that are not read)
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', connectionIds)
          .eq('read', false)
          .neq('sender_id', user.id);
        
        setUnreadMessagesCount(count || 0);
      } else {
        setUnreadMessagesCount(0);
      }
    };

    fetchUnreadMessages();

    // Subscribe to message changes (inserts and updates for read status)
    const subscription = supabase
      .channel('unread-messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages'
      }, () => {
        fetchUnreadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  return (
    <StatusProvider>
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
          tabBarActiveTintColor: '#2962FF', // Vibrant Blue
          tabBarInactiveTintColor: '#9CA3AF', // Gray-400
          headerShown: false,
          tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopWidth: 0,
              elevation: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              height: Platform.OS === 'ios' ? 88 : 60,
              paddingBottom: Platform.OS === 'ios' ? 28 : 8,
              paddingTop: 8,
          },
          tabBarLabelStyle: {
              fontWeight: '600',
              fontSize: 10,
          }
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Proxy',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="location.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            title: address?.city || 'City',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="building.2.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="clubs"
          options={{
            title: 'Clubs',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.3.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
          }}
        />
      </Tabs>
          <StatusFloatingButton />
        </View>
    </StatusProvider>
  );
}
