import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

type ReportReason = { code: string; label: string; askDetails?: boolean };

const USER_REPORT_REASONS: ReportReason[] = [
  { code: 'UNDERAGE', label: 'Underage / minor', askDetails: true },
  { code: 'OFFENSIVE_USERNAME', label: 'Offensive username' },
  { code: 'HARASSMENT', label: 'Harassment / bullying', askDetails: true },
  { code: 'SEXUAL_CONTENT', label: 'Sexual content', askDetails: true },
  { code: 'INAPPROPRIATE_BEHAVIOR', label: 'Inappropriate behavior', askDetails: true },
  { code: 'SPAM_SCAM', label: 'Spam / scam' },
  { code: 'IMPERSONATION', label: 'Impersonation', askDetails: true },
  { code: 'HATE_VIOLENCE', label: 'Hate / violence', askDetails: true },
  { code: 'OTHER', label: 'Other', askDetails: true },
];

async function submitReportAndHide(
  reporterId: string,
  reportedId: string,
  reason: { code: string; label: string; description?: string | null },
) {
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
    reason_code: reason.code,
    reason: reason.label,
    description: reason.description ?? null,
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
                          const showReasonPicker = () => {
                            const actions = [
                              ...USER_REPORT_REASONS.map((r) => ({
                                text: r.label,
                                onPress: () => {
                                  if (Platform.OS === 'ios' && r.askDetails) {
                                    Alert.prompt(
                                      'Add details (optional)',
                                      'Any extra context helps our team review faster.',
                                      (details) => {
                                        const d = (details || '').trim() || null;
                                        submitReportAndHide(currentUserId, targetUserId, { code: r.code, label: r.label, description: d });
                                        onBlockSuccess();
                                      },
                                    );
                                  } else {
                                    submitReportAndHide(currentUserId, targetUserId, { code: r.code, label: r.label, description: null });
                                    onBlockSuccess();
                                  }
                                },
                              })),
                              { text: 'Cancel', style: 'cancel' as const },
                            ];

                            Alert.alert('Reason', 'Choose a reason:', actions as any);
                          };

                          showReasonPicker();
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

