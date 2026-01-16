import { StatusFloatingButton } from '@/components/StatusFloatingButton';
import { StatusProvider } from '@/components/StatusProvider';
import { OrbBackground } from '@/components/ui/OrbBackground';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

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

  // Fetch unread notifications count (so tapping a notification clears the Circle badge)
  useEffect(() => {
    if (!user) return;

    const fetchUnreadNotifications = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('read.is.null,read.eq.false');

      setUnreadNotificationsCount(count || 0);
    };

    fetchUnreadNotifications();

    const subscription = supabase
      .channel('unread-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchUnreadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user]);

  return (
    <StatusProvider>
        <View style={{ flex: 1 }}>
          <OrbBackground opacity={0.42} />
          <Tabs
            screenOptions={{
          tabBarActiveTintColor: isDark ? '#93C5FD' : '#2962FF',
          tabBarInactiveTintColor: isDark ? 'rgba(226,232,240,0.55)' : '#9CA3AF',
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
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
            <View style={{ flex: 1 }}>
              <LinearGradient
                colors={[
                  isDark ? 'rgba(11,18,32,0.76)' : 'rgba(255,255,255,0.78)',
                  isDark ? 'rgba(15,23,42,0.76)' : 'rgba(241,245,249,0.78)',
                  isDark ? 'rgba(2,6,23,0.76)' : 'rgba(226,232,240,0.78)',
                  isDark ? 'rgba(15,23,42,0.76)' : 'rgba(241,245,249,0.78)',
                  isDark ? 'rgba(11,18,32,0.76)' : 'rgba(255,255,255,0.78)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                locations={[0, 0.3, 0.5, 0.7, 1]}
                style={{ flex: 1 }}
              />

            </View>
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
            title: 'Circle',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 64, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <IconSymbol size={34} name="circle" color={color} />
                {(pendingRequestsCount > 0 || unreadMessagesCount > 0 || unreadNotificationsCount > 0) && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 8,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      backgroundColor: '#EF4444',
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>
                      {pendingRequestsCount + unreadMessagesCount + unreadNotificationsCount > 9
                        ? '9+'
                        : String(pendingRequestsCount + unreadMessagesCount + unreadNotificationsCount)}
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
