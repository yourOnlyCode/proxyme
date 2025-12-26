import { IconSymbol } from '@/components/ui/icon-symbol';
import { useConnectionState } from '@/hooks/useConnectionState';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ProfileData } from './ProfileModal';

type ProfileActionButtonsProps = {
  profile: ProfileData | null;
  variant?: 'card' | 'modal';
  myGoals?: string[] | null;
  onStateChange?: () => void; // Callback when state changes (for refreshing)
};

export function ProfileActionButtons({
  profile,
  variant = 'modal',
  myGoals,
  onStateChange,
}: ProfileActionButtonsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const connectionState = useConnectionState(profile);
  const [loading, setLoading] = useState(false);

  const getGoalColors = (goal?: string) => {
    switch (goal) {
      case 'Romance':
        return { bg: 'bg-romance/5', border: 'border-romance/30', text: 'text-romance', badgeBg: 'bg-romance/10' };
      case 'Friendship':
        return { bg: 'bg-friendship/5', border: 'border-friendship/30', text: 'text-friendship', badgeBg: 'bg-friendship/10' };
      case 'Business':
        return { bg: 'bg-business/5', border: 'border-business/30', text: 'text-business', badgeBg: 'bg-business/10' };
      default:
        return { bg: 'bg-white', border: 'border-gray-200', text: 'text-ink', badgeBg: 'bg-gray-100' };
    }
  };

  const primaryGoal = profile?.relationship_goals?.[0];
  const colors = getGoalColors(primaryGoal);

  const sendInterest = async () => {
    if (!user || !profile) return;
    setLoading(true);

    const connectionType = myGoals && myGoals.length > 0 ? myGoals[0] : null;

    const { error } = await supabase.from('interests').insert({
      sender_id: user.id,
      receiver_id: profile.id,
      status: 'pending',
      connection_type: connectionType,
    });

    setLoading(false);
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already Sent', 'You have already sent an interest to this person.');
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Sent!', 'Interest sent successfully.');
      onStateChange?.();
    }
  };

  const cancelInterest = async () => {
    if (!connectionState.interestId) return;
    setLoading(true);

    const { error } = await supabase.from('interests').delete().eq('id', connectionState.interestId);

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Canceled', 'Interest request canceled.');
      onStateChange?.();
    }
  };

  const acceptInterest = async () => {
    if (!connectionState.interestId) return;
    setLoading(true);

    const { error } = await supabase
      .from('interests')
      .update({ status: 'accepted' })
      .eq('id', connectionState.interestId);

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Accepted!', 'You are now connected.');
      onStateChange?.();
    }
  };

  const declineInterest = async () => {
    if (!connectionState.interestId) return;
    setLoading(true);

    const { error } = await supabase.from('interests').delete().eq('id', connectionState.interestId);

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Declined', 'Interest request declined.');
      onStateChange?.();
    }
  };

  const handleMessage = () => {
    if (connectionState.connectionId) {
      router.push(`/chat/${connectionState.connectionId}`);
    }
  };

  // Card variant - simplified buttons
  if (variant === 'card') {
    switch (connectionState.state) {
      case 'already_connected':
        return (
          <TouchableOpacity
            className="w-full bg-white border border-gray-300 py-2 rounded-xl items-center flex-row justify-center shadow-sm"
            onPress={handleMessage}
          >
            <IconSymbol name="bubble.left.fill" size={14} color="#4B5563" style={{ marginRight: 6 }} />
            <Text className="text-gray-700 font-bold text-xs">Message</Text>
          </TouchableOpacity>
        );

      case 'interest_sent':
        return (
          <View className="w-full bg-gray-100 border border-gray-200 py-2 rounded-xl items-center">
            <Text className="text-gray-500 font-bold text-xs">Interest Sent</Text>
          </View>
        );

      case 'interest_incoming':
        return (
          <View className="flex-row space-x-2">
            <TouchableOpacity
              className="flex-1 bg-green-500 py-2 rounded-xl items-center shadow-md active:scale-[0.98]"
              onPress={acceptInterest}
              disabled={loading}
            >
              <Text className="text-white font-bold text-xs">Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-gray-100 border border-gray-200 py-2 rounded-xl items-center"
              onPress={declineInterest}
              disabled={loading}
            >
              <Text className="text-gray-700 font-bold text-xs">Decline</Text>
            </TouchableOpacity>
          </View>
        );

      case 'not_connected':
      default:
        return (
          <TouchableOpacity
            className={`w-full py-2 rounded-xl items-center border ${colors.bg} ${colors.border}`}
            onPress={sendInterest}
            disabled={loading}
          >
            <Text className={`${colors.text} font-bold text-xs`}>
              {loading ? 'Sending...' : 'Send Interest'}
            </Text>
          </TouchableOpacity>
        );
    }
  }

  // Modal variant - full buttons with more detail
  switch (connectionState.state) {
    case 'already_connected':
      return (
        <TouchableOpacity
          className="py-4 rounded-2xl items-center bg-ink shadow-md active:opacity-90"
          onPress={handleMessage}
        >
          <Text className="text-white font-bold text-lg">Message</Text>
        </TouchableOpacity>
      );

    case 'interest_sent':
      return (
        <View className="space-y-3">
          <View className="py-4 rounded-2xl items-center bg-gray-100 border border-gray-200">
            <Text className="text-gray-500 font-bold text-lg">Interest Sent</Text>
          </View>
          <TouchableOpacity
            className="py-3 rounded-xl items-center border border-gray-300"
            onPress={cancelInterest}
            disabled={loading}
          >
            <Text className="text-gray-700 font-semibold">Cancel Request</Text>
          </TouchableOpacity>
        </View>
      );

    case 'interest_incoming':
      return (
        <View className="space-y-3">
          <View className="mb-2 px-4 py-2 bg-blue-50 rounded-xl border border-blue-200">
            <Text className="text-blue-700 text-sm font-semibold text-center">
              You've been shown interest!
            </Text>
          </View>
          <View className="flex-row space-x-3">
            <TouchableOpacity
              className="flex-1 bg-green-500 py-4 rounded-xl items-center shadow-md active:scale-[0.98]"
              onPress={acceptInterest}
              disabled={loading}
            >
              <Text className="text-white font-bold text-lg">Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-gray-100 border border-gray-200 py-4 rounded-xl items-center active:scale-[0.98]"
              onPress={declineInterest}
              disabled={loading}
            >
              <Text className="text-gray-700 font-bold text-lg">Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      );

    case 'not_connected':
    default:
      return (
        <TouchableOpacity
          className={`py-4 rounded-2xl items-center shadow-md active:opacity-90 ${colors.bg} ${colors.border} border`}
          onPress={sendInterest}
          disabled={loading}
        >
          {loading ? (
            <Text className={`${colors.text} font-bold text-lg`}>Sending...</Text>
          ) : (
            <Text className={`${colors.text} font-bold text-lg`}>Send Interest</Text>
          )}
        </TouchableOpacity>
      );
  }
}

