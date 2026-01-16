import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme:preference:v1';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedColorScheme: NonNullable<ColorSchemeName>;
};

const ThemePreferenceContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<NonNullable<ColorSchemeName>>(Appearance.getColorScheme() ?? 'light');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        const v = raw === 'light' || raw === 'dark' || raw === 'system' ? (raw as ThemePreference) : 'system';
        setPreferenceState(v);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    void AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  const resolvedColorScheme = useMemo<NonNullable<ColorSchemeName>>(() => {
    // Dark mode is temporarily disabled; default everyone to light mode.
    // Keep preference wiring in place so we can re-enable safely later.
    return 'light';
  }, [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference,
      resolvedColorScheme,
    }),
    [preference, resolvedColorScheme],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return { preference: ctx.preference, setPreference: ctx.setPreference };
}

export function useResolvedColorScheme(): NonNullable<ColorSchemeName> {
  // Dark mode is temporarily disabled; always return light.
  return 'light';
}

