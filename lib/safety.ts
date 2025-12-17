import { Alert } from 'react-native';
import { supabase } from './supabase';

export async function reportUser(reporterId: string, reportedId: string, reason: string) {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_id: reportedId,
    reason: reason,
  });

  if (error) {
    Alert.alert('Error', 'Failed to submit report. Please try again.');
    console.error(error);
  } else {
    Alert.alert('Report Sent', 'Thank you for keeping our community safe. We will review this shortly.');
  }
}

export async function blockUser(blockerId: string, blockedId: string, onSuccess: () => void) {
  Alert.alert(
    'Block User',
    'Are you sure? You will no longer see each other in the feed or chat.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('blocks').insert({
            blocker_id: blockerId,
            blocked_id: blockedId,
          });

          if (error) {
            Alert.alert('Error', 'Failed to block user.');
            console.error(error);
          } else {
            Alert.alert('Blocked', 'User has been blocked.');
            onSuccess();
          }
        },
      },
    ]
  );
}

export function showSafetyOptions(currentUserId: string, targetUserId: string, onBlockSuccess: () => void) {
    Alert.alert(
        'Options',
        'Select an action',
        [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Report User', 
                onPress: () => {
                    Alert.prompt(
                        'Report User',
                        'Please describe the reason for reporting:',
                        (reason) => reportUser(currentUserId, targetUserId, reason)
                    );
                } 
            },
            { 
                text: 'Block User', 
                style: 'destructive', 
                onPress: () => blockUser(currentUserId, targetUserId, onBlockSuccess) 
            }
        ]
    );
}

