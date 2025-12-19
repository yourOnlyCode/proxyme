import { IconSymbol } from '@/components/ui/icon-symbol';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { StatusFloatingButton } from '@/components/StatusFloatingButton';
import { useProxyLocation } from '@/lib/location';
import { StatusProvider } from '@/components/StatusProvider';

export default function TabLayout() {
  const { address } = useProxyLocation();

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
          name="interests"
          options={{
            title: 'Connections',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
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
