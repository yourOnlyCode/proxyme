import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvt as any, (e: any) => {
      const h = Number(e?.endCoordinates?.height ?? 0);
      setHeight(Number.isFinite(h) ? h : 0);
    });
    const subHide = Keyboard.addListener(hideEvt as any, () => setHeight(0));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return height;
}

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  /** Base padding for content (e.g. room for fixed bottom CTA). */
  basePaddingBottom?: number;
};

/**
 * A ScrollView that:
 * - Always allows tap-outside-to-dismiss keyboard (via outer KeyboardDismissWrapper)
 * - Adds extra bottom padding equal to the keyboard height when open
 *   so the page can scroll “past” the last element and keep inputs visible.
 */
export function KeyboardAwareScrollView({
  basePaddingBottom = 0,
  contentContainerStyle,
  keyboardDismissMode = 'interactive',
  keyboardShouldPersistTaps = 'handled',
  ...props
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const mergedContentStyle = useMemo(() => {
    const extra = keyboardHeight > 0 ? keyboardHeight : 0;
    // When keyboard is open, we intentionally add scroll padding (not a “gap”)
    // so the user can scroll inputs fully above the keyboard.
    return [
      contentContainerStyle,
      {
        paddingBottom: basePaddingBottom + extra + (keyboardHeight > 0 ? 0 : insets.bottom),
      },
    ];
  }, [basePaddingBottom, contentContainerStyle, insets.bottom, keyboardHeight]);

  return (
    <ScrollView
      {...props}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={mergedContentStyle}
    />
  );
}

