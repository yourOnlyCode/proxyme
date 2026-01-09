import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from './icon-symbol';

type ToastType = 'success' | 'error' | 'info';

type ToastContextType = {
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  
  const translateY = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<NodeJS.Timeout>();

  const hide = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setVisible(false);
    });
  }, []);

  const show = useCallback((msg: string, t: ToastType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setType(t);
    
    // Reset animation value
    translateY.setValue(-100);
    setVisible(true);

    // Small delay to ensure Modal is mounted
    setTimeout(() => {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
    }, 100);

    // Auto hide after 4 seconds
    timerRef.current = setTimeout(() => {
      hide();
    }, 4000);
  }, [hide]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-black';
    }
  };

  const getIcon = () => {
    switch (type) {
        case 'success': return 'checkmark.circle.fill';
        case 'error': return 'exclamationmark.circle.fill';
        default: return 'info.circle.fill';
    }
  };

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {visible && message && (
        // IMPORTANT: Avoid using a Modal here; Modals intercept all touches and break scrolling.
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, elevation: 99999 }}>
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: Math.max(insets.top, Platform.OS === 'ios' ? 12 : 12) + 10,
              left: 20,
              right: 20,
              transform: [{ translateY }],
              zIndex: 99999,
              elevation: 99999,
            }}
          >
            <View
              className={`${getBackgroundColor()} p-4 rounded-2xl shadow-lg flex-row items-center justify-between`}
              pointerEvents="auto"
              style={{
                backgroundColor: type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#000000',
                minHeight: 60,
              }}
            >
              <View className="flex-row items-center flex-1">
                <IconSymbol name={getIcon()} size={24} color="white" />
                <Text className="text-white font-bold ml-3 flex-1" style={{ color: 'white' }}>
                  {message}
                </Text>
              </View>
              <TouchableOpacity onPress={hide} className="p-1">
                <IconSymbol name="xmark" size={20} color="white" opacity={0.8} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

