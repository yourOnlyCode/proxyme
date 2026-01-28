import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';

// Keyboard toolbar that appears above the keyboard
export function KeyboardToolbar() {
  // Removed per request: no "Done" keyboard toolbar. Dismissal happens by tapping outside inputs.
  return null;
}

// Wrapper component to dismiss keyboard on tap outside
export function KeyboardDismissWrapper({ children }: { children: React.ReactNode }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const focusedRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvt as any, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt as any, () => {
      setKeyboardVisible(false);
      focusedRectRef.current = null;
    });

    return () => {
      subShow.remove();
      subHide.remove();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const measureFocusedInput = () => {
    const focused = (TextInput.State as any)?.currentlyFocusedInput?.() as any;
    if (!focused || typeof focused.measureInWindow !== 'function') {
      focusedRectRef.current = null;
      return;
    }

    focused.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (![x, y, w, h].every((n) => Number.isFinite(n))) return;
      focusedRectRef.current = { x, y, w, h };
    });
  };

  // When the keyboard is open, keep the focused input bounds fresh so we can
  // tell the difference between “tap inside input to move caret” vs “tap outside to dismiss”.
  useEffect(() => {
    if (!keyboardVisible) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measureFocusedInput();
    });
  }, [keyboardVisible]);

  const hitSlop = useMemo(() => (Platform.OS === 'ios' ? 6 : 10), []);

  return (
    <View
      style={{ flex: 1 }}
      // Capture taps anywhere in the screen without stealing the responder from children.
      // If a TextInput is focused, dismiss the keyboard when the user taps elsewhere.
      //
      // IMPORTANT:
      // - This avoids wrapping ScrollViews/FlatLists in a Touchable (which can cause “stuck” scrolling).
      // - We explicitly ignore taps on any TextInput node to prevent “flash away” cursor issues.
      onStartShouldSetResponderCapture={(e) => {
        // Only engage the dismiss logic while the keyboard is actually visible.
        // This prevents focus/caret glitches on initial input taps.
        if (!keyboardVisible) return false;

        // Always re-measure on a new touch while keyboard is open (caret moves, layout shifts, etc.).
        measureFocusedInput();

        const r = focusedRectRef.current;
        const pageX = Number((e as any)?.nativeEvent?.pageX);
        const pageY = Number((e as any)?.nativeEvent?.pageY);

        if (r && Number.isFinite(pageX) && Number.isFinite(pageY)) {
          const inside =
            pageX >= r.x - hitSlop &&
            pageX <= r.x + r.w + hitSlop &&
            pageY >= r.y - hitSlop &&
            pageY <= r.y + r.h + hitSlop;
          if (inside) return false; // tap inside focused input: allow caret placement
        }

        Keyboard.dismiss();
        return false;
      }}
    >
      {children}
    </View>
  );
}

