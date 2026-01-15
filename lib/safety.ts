import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

async function submitReportAndHide(reporterId: string, reportedId: string, reason: string) {
  // 1) Hide immediately for the reporter
  await supabase.from('blocked_users').upsert(
    {
      blocker_id: reporterId,
      blocked_id: reportedId,
    } as any,
    { onConflict: 'blocker_id,blocked_id' },
  );

  // 2) Create a pending report (schema expects reported_user_id + content_type + reason)
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedId,
    content_type: 'user',
    reason,
    description: null,
    status: 'pending',
  } as any);

  if (error) {
    Alert.alert('Error', 'Failed to submit report. Please try again.');
    console.error(error);
  } else {
    Alert.alert('Report Sent', 'This user is now hidden for you, and our team will review the report.');
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
          const { error } = await supabase.from('blocked_users').insert({
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
                    // Note: React Native's native Alert does not support rich text (bold). We emulate emphasis
                    // with a second-paragraph IMPORTANT line so it stands out on both iOS and Android.
                    const warning =
                      'Reporting a user will hide their posts and put them under review for proportionate consequences.' +
                      '\n\n' +
                      'IMPORTANT: IF THEIR POST IS NOT FOUND TO BE OFFENSIVE IN ANY WAY, THIS MAY IMPACT YOU AS THE REPORTER. ' +
                      'Are you sure you want to move forward?';

                    Alert.alert('Report user?', warning, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Continue',
                        style: 'destructive',
                        onPress: () => {
                          if (Platform.OS === 'ios') {
                            Alert.prompt(
                              'Report User',
                              'Please describe the reason for reporting:',
                              (reason) => {
                                const r = (reason || '').trim() || 'No reason provided';
                                submitReportAndHide(currentUserId, targetUserId, r);
                                onBlockSuccess(); // remove from current UI immediately
                              },
                            );
                          } else {
                            // Android: no Alert.prompt — offer quick reasons
                            Alert.alert('Reason', 'Choose a reason:', [
                              { text: 'Spam', onPress: () => { submitReportAndHide(currentUserId, targetUserId, 'Spam'); onBlockSuccess(); } },
                              { text: 'Harassment', onPress: () => { submitReportAndHide(currentUserId, targetUserId, 'Harassment'); onBlockSuccess(); } },
                              { text: 'Nudity', onPress: () => { submitReportAndHide(currentUserId, targetUserId, 'Nudity'); onBlockSuccess(); } },
                              { text: 'Other', style: 'destructive', onPress: () => { submitReportAndHide(currentUserId, targetUserId, 'Other'); onBlockSuccess(); } },
                              { text: 'Cancel', style: 'cancel' },
                            ]);
                          }
                        },
                      },
                    ]);
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

