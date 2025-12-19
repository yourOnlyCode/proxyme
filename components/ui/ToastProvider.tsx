import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, SafeAreaView, Dimensions, Platform } from 'react-native';
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
  
  const translateY = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<NodeJS.Timeout>();

  const show = useCallback((msg: string, t: ToastType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setType(t);
    setVisible(true);

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start();

    // Auto hide after 4 seconds
    timerRef.current = setTimeout(() => {
      hide();
    }, 4000);
  }, []);

  const hide = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setVisible(false);
    });
  }, []);

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
      {visible && (
        <Animated.View 
          style={{ 
            position: 'absolute', 
            top: Platform.OS === 'ios' ? 50 : 20, 
            left: 20, 
            right: 20, 
            transform: [{ translateY }],
            zIndex: 9999
          }}
        >
          <View className={`${getBackgroundColor()} p-4 rounded-2xl shadow-lg flex-row items-center justify-between`}>
             <View className="flex-row items-center flex-1">
                <IconSymbol name={getIcon()} size={24} color="white" />
                <Text className="text-white font-bold ml-3 flex-1">{message}</Text>
             </View>
             <TouchableOpacity onPress={hide} className="p-1">
                <IconSymbol name="xmark" size={20} color="white" opacity={0.8} />
             </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

