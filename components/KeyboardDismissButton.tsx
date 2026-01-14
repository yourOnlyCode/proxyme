import { IconSymbol } from '@/components/ui/icon-symbol';
import { useEffect, useState } from 'react';
import { Animated, Keyboard, Platform, TextInput, TouchableOpacity, View, findNodeHandle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keyboard toolbar that appears above the keyboard
export function KeyboardToolbar() {
  // Removed per request: no "Done" keyboard toolbar. Dismissal happens by tapping outside inputs.
  return null;
}

// Wrapper component to dismiss keyboard on tap outside
export function KeyboardDismissWrapper({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{ flex: 1 }}
      // Capture taps anywhere in the screen without stealing the responder from children.
      // If a TextInput is focused, dismiss the keyboard when the user taps elsewhere.
      onStartShouldSetResponderCapture={(e) => {
        // RN warns loudly if we call currentlyFocusedField(); only use currentlyFocusedInput().
        const focused = (TextInput.State as any)?.currentlyFocusedInput?.();

        const focusedHandle = focused ? findNodeHandle(focused) : null;
        if (!focusedHandle) return false;
        if (e?.target === focusedHandle) return false;

        Keyboard.dismiss();
        return false;
      }}
    >
      {children}
    </View>
  );
}

