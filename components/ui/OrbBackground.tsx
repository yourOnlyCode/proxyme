import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Subtle "Auth-style" orb backdrop for app screens.
 * Designed to be very light; render behind content with pointerEvents="none".
 */
export function OrbBackground({ opacity = 0.62 }: { opacity?: number }) {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';

  // Light mode stays EXACTLY as-is (original palette). Dark mode swaps to deeper purples/blues.
  const baseBg = isDark ? '#070A14' : '#FFFFFF';
  const blurTint = isDark ? 'dark' : 'light';
  const effectiveOpacity = isDark ? opacity * 0.82 : opacity;

  const orb1 = isDark
    ? ['rgba(99,102,241,0.22)', 'rgba(59,130,246,0.13)', 'rgba(168,85,247,0.16)']
    : ['rgba(56,189,248,0.46)', 'rgba(37,99,235,0.22)', 'rgba(34,211,238,0.30)'];
  const orb2 = isDark
    ? ['rgba(147,51,234,0.14)', 'rgba(59,130,246,0.13)', 'rgba(99,102,241,0.16)']
    : ['rgba(34,211,238,0.36)', 'rgba(56,189,248,0.20)', 'rgba(37,99,235,0.24)'];
  const orb3 = isDark
    ? ['rgba(37,99,235,0.13)', 'rgba(99,102,241,0.13)', 'rgba(168,85,247,0.10)']
    : ['rgba(250,204,21,0.18)', 'rgba(56,189,248,0.22)', 'rgba(34,211,238,0.16)'];
  const orb4 = isDark
    ? ['rgba(99,102,241,0.13)', 'rgba(59,130,246,0.10)', 'rgba(147,51,234,0.12)']
    : ['rgba(59,130,246,0.22)', 'rgba(34,211,238,0.18)', 'rgba(56,189,248,0.16)'];

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: baseBg }} />

      {/* Orb 1 */}
      <View
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: 999,
          top: -220,
          left: -200,
          opacity: effectiveOpacity,
          transform: [{ rotate: '-10deg' }],
        }}
      >
        <LinearGradient
          colors={orb1}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 20 : 38} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Orb 2 */}
      <View
        style={{
          position: 'absolute',
          width: 460,
          height: 460,
          borderRadius: 999,
          top: 120,
          right: -220,
          opacity: effectiveOpacity,
          transform: [{ rotate: '18deg' }],
        }}
      >
        <LinearGradient
          colors={orb2}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.8, y: 0.8 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 18 : 34} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Orb 3 */}
      <View
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: 999,
          bottom: -260,
          left: -160,
          opacity: effectiveOpacity,
          transform: [{ rotate: '8deg' }],
        }}
      >
        <LinearGradient
          colors={orb3}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.85, y: 0.85 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 16 : 30} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Orb 4 (center-ish) — helps ensure the effect is visible on all screen sizes */}
      <View
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: 999,
          top: 220,
          left: 20,
          opacity: (isDark ? effectiveOpacity : opacity) * (isDark ? 0.42 : 0.55),
          transform: [{ rotate: '-6deg' }],
        }}
      >
        <LinearGradient
          colors={orb4}
          start={{ x: 0.15, y: 0.15 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 16 : 28} tint={blurTint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Global soft wash */}
      {Platform.OS !== 'android' && (
        <BlurView
          pointerEvents="none"
          intensity={isDark ? 10 : 14}
          tint={blurTint}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}

