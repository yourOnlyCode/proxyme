import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(userId: string) {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    // Get the token
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        
        // Robust check for valid UUID
        const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        // If we have a valid projectId, use it.
        // If it is 'your-project-id' (placeholder) OR invalid, DO NOT pass it.
        // Passing an empty object {} triggers the error if projectId is missing in context but we tried to be explicit.
        // The safest way for development (Expo Go) is to call getExpoPushTokenAsync() with NO arguments if we don't have a specific ID.
        
        if (projectId && isValidUUID(projectId)) {
            token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        } else {
            // Fallback for Expo Go / Dev Client without explicit ID
            token = (await Notifications.getExpoPushTokenAsync()).data;
        }

        console.log('Expo Push Token:', token);

        // Save to Supabase
        if (token) {
            const { error } = await supabase
                .from('profiles')
                .update({ expo_push_token: token })
                .eq('id', userId);
            
            if (error) {
                console.error('Error saving push token to Supabase:', error);
            }
        }

    } catch (e) {
        // Log but don't crash app flow
        console.log('Push Notification Error (Non-Fatal):', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
