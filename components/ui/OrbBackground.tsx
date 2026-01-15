import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, View } from 'react-native';

/**
 * Subtle "Auth-style" orb backdrop for app screens.
 * Designed to be very light; render behind content with pointerEvents="none".
 */
export function OrbBackground({ opacity = 0.62 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />

      {/* Orb 1 */}
      <View
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: 999,
          top: -220,
          left: -200,
          opacity,
          transform: [{ rotate: '-10deg' }],
        }}
      >
        <LinearGradient
          colors={['rgba(56,189,248,0.46)', 'rgba(37,99,235,0.22)', 'rgba(34,211,238,0.30)']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 20 : 38} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
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
          opacity,
          transform: [{ rotate: '18deg' }],
        }}
      >
        <LinearGradient
          colors={['rgba(34,211,238,0.36)', 'rgba(56,189,248,0.20)', 'rgba(37,99,235,0.24)']}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.8, y: 0.8 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 18 : 34} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
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
          opacity,
          transform: [{ rotate: '8deg' }],
        }}
      >
        <LinearGradient
          colors={['rgba(250,204,21,0.18)', 'rgba(56,189,248,0.22)', 'rgba(34,211,238,0.16)']}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 0.85, y: 0.85 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 16 : 30} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
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
          opacity: opacity * 0.55,
          transform: [{ rotate: '-6deg' }],
        }}
      >
        <LinearGradient
          colors={['rgba(59,130,246,0.22)', 'rgba(34,211,238,0.18)', 'rgba(56,189,248,0.16)']}
          start={{ x: 0.15, y: 0.15 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%', borderRadius: 999 }}
        />
        <BlurView intensity={Platform.OS === 'android' ? 16 : 28} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }} />
      </View>

      {/* Global soft wash */}
      {Platform.OS !== 'android' && (
        <BlurView
          pointerEvents="none"
          intensity={14}
          tint="light"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}

