import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen 
        name="interests" 
        options={{ 
            presentation: 'modal', 
            title: 'Select Interests',
            headerShown: true, // Show header for modal
            headerBackTitle: 'Back'
        }} 
      />
    </Stack>
  );
}

