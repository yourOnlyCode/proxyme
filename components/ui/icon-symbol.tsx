// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'xmark': 'close',
  'arrow.triangle.2.circlepath': 'cached',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'pencil': 'edit',
  'photo.fill': 'image',
  'camera.fill': 'camera-alt',
  'arrow.up': 'arrow-upward',
  'plus': 'add',
  'pencil.and.outline': 'edit',
  'location.fill': 'place',
  'checkmark.seal.fill': 'check-circle',
  'checkmark': 'check',
  'ellipsis': 'more-horiz',
  'message.fill': 'message',
  'square.and.arrow.up.fill': 'share',
  'gift.fill': 'card-giftcard',
  'gear': 'settings',
  'person.2.fill': 'people',
  'heart.fill': 'favorite',
  'briefcase.fill': 'work',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
