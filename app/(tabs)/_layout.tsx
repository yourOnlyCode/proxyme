import { StatusFloatingButton } from '@/components/StatusFloatingButton';
import { StatusProvider } from '@/components/StatusProvider';
import { OrbBackground } from '@/components/ui/OrbBackground';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth';
import { useProxyLocation } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

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
          // Only messages *to me* should contribute to my unread badge
          .eq('receiver_id', user.id)
          // Treat NULL as unread too (older rows before read column defaults, or legacy data)
          .or('read.is.null,read.eq.false')
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
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
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
          <OrbBackground opacity={0.34} />
          <Tabs
            screenOptions={{
          tabBarActiveTintColor: '#2962FF', // Vibrant Blue
          tabBarInactiveTintColor: '#9CA3AF', // Gray-400
          headerShown: false,
          sceneContainerStyle: { backgroundColor: 'transparent' },
          tabBarStyle: {
              backgroundColor: 'transparent', // Transparent to show gradient backdrop
              borderTopWidth: 0, // Remove hard border completely
              elevation: 0, // Remove default Android elevation
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -6 }, // Upward shadow creates motion blur effect
              shadowOpacity: 0.1, // Slightly more visible for glossy effect
              shadowRadius: 20, // Large blur radius for soft, diffused glow
              height: Platform.OS === 'ios' ? 88 : 60,
              paddingBottom: Platform.OS === 'ios' ? 28 : 8,
              paddingTop: 8,
              overflow: 'visible',
          },
          tabBarLabelStyle: {
              fontWeight: '600',
              fontSize: 10,
          },
          tabBarBackground: () => (
            <LinearGradient
              colors={[
                '#FFFFFF',
                '#F1F5F9',
                '#E2E8F0',
                '#F1F5F9',
                '#FFFFFF',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              locations={[0, 0.3, 0.5, 0.7, 1]}
              style={{
                flex: 1,
              }}
            />
          ),
        }}
        >
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
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarIcon: ({ color }) => (
              <View>
                <IconSymbol size={28} name="tray.fill" color={color} />
                {(pendingRequestsCount > 0 || unreadMessagesCount > 0) && (
                  <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1 border-2 border-white">
                    <Text className="text-white text-[9px] font-bold">
                      {pendingRequestsCount + unreadMessagesCount > 9 ? '9+' : String(pendingRequestsCount + unreadMessagesCount)}
                    </Text>
                  </View>
                )}
              </View>
            ),
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
