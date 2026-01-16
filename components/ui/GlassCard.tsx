import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/hooks/use-color-scheme';

type GlassCardProps = {
  children: React.ReactNode;
  /**
   * Tailwind classes applied to the outer container (rounded, margin, etc.)
   */
  className?: string;
  /**
   * Tailwind classes applied to the inner content container (padding, layout).
   */
  contentClassName?: string;
  /**
   * Optional style overrides for the outer container.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Blur settings (iOS/web). Android falls back to translucent fill for performance.
   */
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
};

export function GlassCard({
  children,
  className,
  contentClassName,
  style,
  intensity = 40,
  tint,
}: GlassCardProps) {
  const useBlur = Platform.OS === 'ios' || Platform.OS === 'web';
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  const resolvedTint = tint ?? (isDark ? 'dark' : 'light');

  return (
    <View
      className={className ?? ''}
      style={[
        {
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.18)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.22 : 0.12,
          shadowRadius: 22,
          elevation: 10,
        },
        style,
      ]}
    >
      {useBlur ? (
        <BlurView
          intensity={intensity}
          tint={resolvedTint}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      <View
        className={contentClassName ?? ''}
        style={{
          backgroundColor: useBlur
            ? (isDark ? 'rgba(2,6,23,0.28)' : 'rgba(255,255,255,0.18)')
            : (isDark ? 'rgba(2,6,23,0.72)' : 'rgba(255,255,255,0.75)'),
        }}
      >
        {children}
      </View>
    </View>
  );
}

