import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="edit-profile" 
        options={{ 
          title: 'Edit Profile', 
          presentation: 'modal',
          headerBackTitle: 'Profile' 
        }} 
      />
      <Stack.Screen 
        name="edit-interests" 
        options={{ 
          title: 'Interests', 
          presentation: 'modal' 
        }} 
      />
      <Stack.Screen 
        name="get-verified" 
        options={{ 
          title: 'Get Verified', 
          presentation: 'modal' 
        }} 
      />
    </Stack>
  );
}
