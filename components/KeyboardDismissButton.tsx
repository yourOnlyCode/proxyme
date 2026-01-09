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
        className="flex-row justify-end items-center px-3"
        style={{ 
          paddingBottom: 6, 
          paddingTop: 6,
        }}
      >
        <TouchableOpacity 
          onPress={() => Keyboard.dismiss()}
          className="px-4 py-2 rounded-full bg-black"
          activeOpacity={0.8}
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <Text className="text-white text-sm font-medium">Done</Text>
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

