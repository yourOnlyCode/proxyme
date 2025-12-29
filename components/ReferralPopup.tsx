import { IconSymbol } from '@/components/ui/icon-symbol';
import { useToast } from '@/components/ui/ToastProvider';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Share, Text, TouchableOpacity, View } from 'react-native';

type ReferralPopupProps = {
  visible: boolean;
  onClose: () => void;
  friendCode: string | null;
  onNeverShowAgain: () => void;
};

export function ReferralPopup({ visible, onClose, friendCode, onNeverShowAgain }: ReferralPopupProps) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [neverShowAgain, setNeverShowAgain] = useState(false);

  const shareText = `Join me on Proxyme! Use my friend code ${friendCode || 'XXXXXX'} to unlock verification when you sign up. Download now!`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: shareText,
        title: 'Join me on Proxyme!',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      // Use Share API which allows copying on most platforms
      const result = await Share.share({
        message: friendCode || '',
        title: 'Friend Code',
      });
      
      // On some platforms, Share doesn't actually copy, so we show a message
      if (result.action === Share.sharedAction) {
        toast.show('Friend code shared!', 'success');
      } else {
        toast.show('Friend code: ' + friendCode, 'info');
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.show('Friend code: ' + friendCode, 'info');
    }
  };

  const handleClose = () => {
    if (neverShowAgain) {
      onNeverShowAgain();
      router.push('/(tabs)/explore');
    }
    setNeverShowAgain(false);
    onClose();
  };

  if (!friendCode) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/60 items-center justify-center px-6">
        <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
          {/* Header */}
          <View className="items-center mb-4">
            <Text className="text-2xl font-bold text-center text-ink mb-2">
              Proxyme is powered by users like you!
            </Text>
            <Text className="text-sm text-gray-600 text-center">
              Share with your friends to unlock verification.
            </Text>
          </View>

          {/* Subtext */}
          <Text className="text-xs text-gray-500 text-center mb-6">
            When 10 friends use your code verification will automatically unlock.
          </Text>

          {/* Friend Code Display */}
          <View className="bg-gray-100 rounded-xl p-4 mb-6 items-center">
            <Text className="text-xs text-gray-500 mb-2">Your Friend Code</Text>
            <Text className="text-3xl font-bold text-ink tracking-wider">
              {friendCode}
            </Text>
            <TouchableOpacity
              onPress={copyToClipboard}
              className="mt-2 px-4 py-2 bg-gray-200 rounded-lg"
            >
              <Text className="text-sm font-semibold text-gray-700">Copy Code</Text>
            </TouchableOpacity>
          </View>

          {/* Share Button */}
          <TouchableOpacity
            onPress={handleShare}
            className="bg-ink py-4 rounded-xl flex-row items-center justify-center mb-4 shadow-md"
          >
            <IconSymbol name="paperplane.fill" size={20} color="white" />
            <Text className="text-white font-semibold ml-2">Share</Text>
          </TouchableOpacity>

          {/* Never Show Again Checkbox */}
          <TouchableOpacity
            onPress={() => setNeverShowAgain(!neverShowAgain)}
            className="flex-row items-center mb-4"
          >
            <View className={`w-5 h-5 rounded border-2 mr-2 items-center justify-center ${
              neverShowAgain ? 'bg-ink border-ink' : 'border-gray-300'
            }`}>
              {neverShowAgain && (
                <IconSymbol name="checkmark" size={14} color="white" />
              )}
            </View>
            <Text className="text-gray-600 text-sm">Never show again</Text>
          </TouchableOpacity>

          {/* Close Button */}
          <TouchableOpacity
            onPress={handleClose}
            className="py-3 rounded-xl border border-gray-300 items-center"
          >
            <Text className="text-gray-700 font-semibold">Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

