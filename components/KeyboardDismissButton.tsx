import { IconSymbol } from '@/components/ui/icon-symbol';
import { useEffect, useState } from 'react';
import { Animated, Keyboard, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keyboard toolbar that appears above the keyboard
export function KeyboardToolbar() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const slideAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
          useNativeDriver: true,
        }).start();
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
          useNativeDriver: true,
        }).start(() => {
          setKeyboardVisible(false);
          setKeyboardHeight(0);
        });
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [slideAnim]);

  if (!keyboardVisible) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: keyboardHeight,
        left: 0,
        right: 0,
        transform: [{ translateY }],
        zIndex: 1000,
      }}
    >
      <View 
        className="bg-white border-t border-gray-200 flex-row justify-end items-center px-3"
        style={{ paddingBottom: Math.max(insets.bottom, 4), paddingTop: 4, height: 36 }}
      >
        <TouchableOpacity 
          onPress={() => Keyboard.dismiss()}
          className="px-3 py-1.5 flex-row items-center rounded-full bg-gray-50"
          activeOpacity={0.7}
        >
          <IconSymbol name="chevron.down" size={14} color="#6B7280" />
          <Text className="text-gray-600 text-xs font-medium ml-1">Done</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// Wrapper component to dismiss keyboard on tap outside
export function KeyboardDismissWrapper({ children }: { children: React.ReactNode }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1 }}>
        {children}
        <KeyboardToolbar />
      </View>
    </TouchableWithoutFeedback>
  );
}

