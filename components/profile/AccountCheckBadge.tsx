import { IconSymbol } from '@/components/ui/icon-symbol';
import { isSuperUserByShareCount, isTrendsetterByReferralCount } from '@/lib/verification';
import type { StyleProp, ViewStyle } from 'react-native';

export function AccountCheckBadge({
  shareCount,
  referralCount,
  size = 14,
  style,
}: {
  shareCount?: number | null;
  referralCount?: number | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (isSuperUserByShareCount(shareCount)) {
    return <IconSymbol name="checkmark.seal.fill" size={size} color="#3B82F6" style={style as any} />;
  }

  if (isTrendsetterByReferralCount(referralCount)) {
    return <IconSymbol name="checkmark.seal.fill" size={size} color="#F97316" style={style as any} />;
  }

  return null;
}

