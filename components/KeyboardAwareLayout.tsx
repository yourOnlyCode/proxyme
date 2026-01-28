import { KeyboardDismissWrapper } from '@/components/KeyboardDismissButton';
import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

// Single source of truth for keyboard behavior and offsets across the app.
export const KEYBOARD_BEHAVIOR_IOS = 'padding' as const;
export const KEYBOARD_BEHAVIOR_ANDROID = 'height' as const;
export const KEYBOARD_BEHAVIOR =
  Platform.OS === 'ios' ? KEYBOARD_BEHAVIOR_IOS : KEYBOARD_BEHAVIOR_ANDROID;

/** Default vertical offset so the first content line is not hidden by nav/status. */
export function getDefaultKeyboardOffset(insets: { top: number }, headerHeight: number = 0) {
  return insets.top + headerHeight;
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvt as any, () => setVisible(true));
    const subHide = Keyboard.addListener(hideEvt as any, () => setVisible(false));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return visible;
}

type KeyboardAwareLayoutProps = {
  children: React.ReactNode;
  /** Offset from top (e.g. status + header). Default: insets.top. */
  headerOffset?: number;
  /** Override behavior; default uses KEYBOARD_BEHAVIOR. */
  behavior?: 'padding' | 'height' | 'position';
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** If true, do not wrap in KeyboardDismissWrapper (e.g. when used inside another wrapper). */
  noDismissWrapper?: boolean;
};

/**
 * Wraps content with consistent keyboard-avoiding behavior and optional tap-to-dismiss.
 * Use for full-screen layouts (auth, modals, etc.) so the keyboard doesn’t cover inputs
 * and there’s no extra “bar” from inconsistent offsets.
 */
export function KeyboardAwareLayout({
  children,
  headerOffset,
  behavior = KEYBOARD_BEHAVIOR,
  style,
  contentContainerStyle,
  noDismissWrapper = false,
}: KeyboardAwareLayoutProps) {
  const insets = useSafeAreaInsets();
  const offset = headerOffset ?? insets.top;

  const content = (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? behavior : behavior === 'position' ? 'height' : behavior}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
    >
      {contentContainerStyle ? (
        <View style={[{ flex: 1 }, contentContainerStyle]}>{children}</View>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );

  if (noDismissWrapper) return content;
  return <KeyboardDismissWrapper>{content}</KeyboardDismissWrapper>;
}

type StickyInputLayoutProps = {
  /** Scroll content (ScrollView, FlatList, etc.). Rendered above the fixed input. */
  children: React.ReactNode;
  /** Fixed input row rendered just above the keyboard with consistent bottom inset. */
  renderInput: () => React.ReactNode;
  /** Used as keyboardVerticalOffset so the keyboard doesn’t cover the input. Default: insets.top + 56. */
  headerOffset?: number;
  style?: StyleProp<ViewStyle>;
  /** Background color for the input row container (avoids gray flash). */
  inputRowBackgroundColor?: string;
};

/**
 * Keeps a sticky input row above the keyboard with one consistent layout.
 * Scroll content and input are siblings; the input is never inside the list,
 * which avoids cursor/tap glitches from ListFooterComponent.
 */
export function StickyInputLayout({
  children,
  renderInput,
  headerOffset,
  style,
  inputRowBackgroundColor,
}: StickyInputLayoutProps) {
  const insets = useSafeAreaInsets();
  const offset = headerOffset ?? insets.top + 56;
  const keyboardVisible = useKeyboardVisible();

  return (
    <KeyboardDismissWrapper>
      <KeyboardAvoidingView
        style={[{ flex: 1 }, style]}
        behavior={KEYBOARD_BEHAVIOR}
        keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
      >
        <View style={{ flex: 1 }}>
          {children}
        </View>
        <View
          style={{
            // Avoid a big “gap bar” between keyboard and input while the keyboard is open.
            // When closed, keep a small safe-area cushion.
            paddingBottom: keyboardVisible ? 0 : insets.bottom,
            backgroundColor: inputRowBackgroundColor ?? undefined,
          }}
        >
          {renderInput()}
        </View>
      </KeyboardAvoidingView>
    </KeyboardDismissWrapper>
  );
}
