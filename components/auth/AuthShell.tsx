import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthShellProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const ROTATING_WORDS = [
  { text: 'adventure', color: '#FBBF24' }, // yellow - friend
  { text: 'spark', color: '#F472B6' },     // pink - romance
  { text: 'collaboration', color: '#60A5FA' }, // blue - professional
  { text: 'bestie', color: '#FBBF24' },    // yellow - friend
  { text: 'connection', color: '#F472B6' }, // pink - romance
  { text: 'opportunity', color: '#60A5FA' }, // blue - professional
  { text: 'squad mate', color: '#FBBF24' }, // yellow - friend
  { text: 'love story', color: '#F472B6' }, // pink - romance
  { text: 'breakthrough', color: '#60A5FA' }, // blue - professional
];

function AnimatedSubtitle() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const barWidth = useRef(new Animated.Value(70)).current;
  const currentBarWidth = useRef(70);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out text
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        // Change word (this will trigger onLayout with new width)
        setCurrentIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        // Fade in text
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, 2500); // Change word every 2.5 seconds

    return () => clearInterval(interval);
  }, [fadeAnim]);

  const currentWord = ROTATING_WORDS[currentIndex];

  const handleTextLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    // Use faster animation when shrinking, slower when growing
    const isShrinking = width < currentBarWidth.current;
    const duration = isShrinking ? 200 : 400;
    
    currentBarWidth.current = width;
    
    // Animate bar smoothly from current width to new width
    Animated.timing(barWidth, {
      toValue: width,
      duration: duration,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
      {/* Line 1: "your next" */}
      <Text
        style={{
          fontFamily: 'LibertinusSans-Regular',
          fontSize: 18,
          color: '#334155',
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        your next
      </Text>

      {/* Line 2: changing word with colored bar underneath */}
      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <Animated.Text
          onLayout={handleTextLayout}
          style={{
            fontFamily: 'LibertinusSans-Bold',
            fontSize: 22,
            color: '#0F172A',
            textAlign: 'center',
            opacity: fadeAnim,
          }}
        >
          {currentWord.text}
        </Animated.Text>
        {/* Colored underline bar - smoothly grows/shrinks to match text width */}
        <Animated.View
          style={{
            marginTop: 4,
            width: barWidth,
            height: 3,
            borderRadius: 2,
            backgroundColor: currentWord.color,
          }}
        />
      </View>

      {/* Line 3: "is one tap away" */}
      <Text
        style={{
          fontFamily: 'LibertinusSans-Regular',
          fontSize: 18,
          color: '#334155',
          textAlign: 'center',
        }}
      >
        is one tap away
      </Text>
    </View>
  );
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const showAnimatedSubtitle = !subtitle; // Show animated subtitle if no custom subtitle provided

  return (
    <View className="flex-1 bg-white">
      {/* Flat white background (avoid banding / harsh gradient seams) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />

      {/* Gradient orbs */}
      {/* Orb A (blue/teal glimpse) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120,
          left: -120,
          width: 320,
          height: 320,
          borderRadius: 999,
          shadowColor: 'rgba(56,189,248,1)',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 70,
          elevation: 8,
          opacity: 0.98,
        }}
      >
        <LinearGradient
          colors={[
            'rgba(56,189,248,0.34)',
            'rgba(45,212,191,0.20)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.55, 1]}
          style={{ flex: 1, borderRadius: 999 }}
        />
        {/* Extra edge-softening blur */}
        <BlurView intensity={40} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Orb B (cyan/blue glimpse) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -140,
          right: -140,
          width: 360,
          height: 360,
          borderRadius: 999,
          shadowColor: 'rgba(34,211,238,1)',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.14,
          shadowRadius: 80,
          elevation: 8,
          opacity: 0.96,
        }}
      >
        <LinearGradient
          colors={[
            'rgba(34,211,238,0.22)',
            'rgba(59,130,246,0.20)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.6, 1]}
          style={{ flex: 1, borderRadius: 999 }}
        />
        {/* Extra edge-softening blur */}
        <BlurView intensity={35} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Tiny warm highlight (very subtle) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 150,
          right: -70,
          width: 180,
          height: 180,
          borderRadius: 999,
          shadowColor: 'rgba(250,204,21,1)',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.08,
          shadowRadius: 60,
          elevation: 6,
          opacity: 0.75,
        }}
      >
        <LinearGradient
          colors={[
            'rgba(250,204,21,0.14)',
            'rgba(45,212,191,0.10)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.55, 1]}
          style={{ flex: 1, borderRadius: 999 }}
        />
        {/* Extra edge-softening blur */}
        <BlurView intensity={28} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Global soft blur wash to eliminate any remaining harsh transitions between orbs */}
      {Platform.OS !== 'android' && (
        <BlurView
          pointerEvents="none"
          intensity={18}
          tint="light"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 18, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 16 }}>
              {/* Title (no card, plain text) */}
              {!!title && (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <TextH1>{title}</TextH1>
                </View>
              )}

              {/* Main Auth Card */}
              <BlurView
                intensity={Platform.OS === 'android' ? 18 : 45}
                tint="light"
                style={{
                  borderRadius: 28,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(15,23,42,0.06)',
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 18,
                    backgroundColor: 'rgba(255,255,255,0.62)',
                  }}
                >
                  {(subtitle || showAnimatedSubtitle) && (
                    <View style={{ marginBottom: 18, alignItems: 'center' }}>
                      {subtitle ? <TextSub>{subtitle}</TextSub> : showAnimatedSubtitle ? <AnimatedSubtitle /> : null}
                    </View>
                  )}

                  {children}
                  {!!footer && <View style={{ marginTop: 14 }}>{footer}</View>}
                </View>
              </BlurView>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function TextH1({ children }: { children: React.ReactNode }) {
  return (
    <TextBase weight="regular" size={26} align="center">
      {children}
    </TextBase>
  );
}

function TextSub({ children }: { children: React.ReactNode }) {
  return (
    <View className="px-1">
      <TextBase size={13} color="rgba(71,85,105,0.90)" align="center">
        {children}
      </TextBase>
    </View>
  );
}

function TextBase({
  children,
  weight,
  size,
  color,
  align,
}: {
  children: React.ReactNode;
  weight?: 'regular' | 'bold';
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <Text
      style={{
        color: color ?? '#0F172A',
        fontSize: size ?? 15,
        fontFamily: weight === 'bold' ? 'LibertinusSans-Bold' : 'LibertinusSans-Regular',
        letterSpacing: -0.2,
        textAlign: align ?? 'left',
      }}
    >
      {children}
    </Text>
  );
}

