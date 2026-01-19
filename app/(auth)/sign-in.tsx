import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Alert, Keyboard, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { AuthShell } from '../../components/auth/AuthShell';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { supabase } from '../../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const router = useRouter();

  async function signInWithEmail() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      // Routing is usually handled by the auth listener in app/_layout.tsx,
      // but keep this for snappy UX.
      router.replace('/(tabs)');
    }

    setLoading(false);
  }

  async function sendPasswordReset() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email above, then tap “Forgot password?”.');
      return;
    }

    setSendingReset(true);
    try {
      // This must be added to Supabase Auth "Redirect URLs" allowlist:
      // proxybusiness://auth/reset-password
      const redirectTo =
        Platform.OS === 'web'
          ? typeof window !== 'undefined'
            ? `${window.location.origin}/auth/reset-password`
            : undefined
          : Linking.createURL('auth/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, redirectTo ? { redirectTo } : undefined);
      if (error) throw error;

      Alert.alert(
        'Check your email',
        'If an account exists for this email, we sent a password reset link. Open it on this device to continue.',
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send reset email. Please try again.');
    } finally {
      setSendingReset(false);
    }
  }
  const content = (
    <AuthShell
      title="proxyme"
      subtitle=""
      footer={
        <View className="flex-row justify-center mt-1">
          <Text className="text-slate-600">Don’t have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text className="font-bold text-ink">Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      }
    >
      <View>
        <Text className="text-slate-700 mb-2 ml-1" style={{ fontFamily: 'LibertinusSans-Regular' }}>
          Email
        </Text>
        <TextInput
          className="bg-white/80 border border-slate-200 rounded-2xl px-4 py-4 text-base mb-4 text-ink"
          placeholder="youare@beautiful.com"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {}}
          onFocus={(e) => {
            if (Platform.OS === 'web') e.stopPropagation();
          }}
        />

        <Text className="text-slate-700 mb-2 ml-1" style={{ fontFamily: 'LibertinusSans-Regular' }}>
          Password
        </Text>
        <TextInput
          className="bg-white/80 border border-slate-200 rounded-2xl px-4 py-4 text-base mb-6 text-ink"
          placeholder="••••••••"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
            void signInWithEmail();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') e.stopPropagation();
          }}
        />

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={sendingReset}
          onPress={() => void sendPasswordReset()}
          className="mb-4 self-end"
        >
          <Text className="text-ink font-bold" style={{ opacity: sendingReset ? 0.6 : 1 }}>
            {sendingReset ? 'Sending…' : 'Forgot password?'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="bg-black py-4 rounded-2xl items-center shadow-xl" onPress={() => void signInWithEmail()} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg" style={{ fontFamily: 'LibertinusSans-Regular' }}>
              Sign In
            </Text>
          )}
        </TouchableOpacity>

        <SocialAuthButtons />
      </View>
    </AuthShell>
  );

  if (Platform.OS === 'web') return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View className="flex-1">{content}</View>
    </TouchableWithoutFeedback>
  );
}
