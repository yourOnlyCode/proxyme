import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { AuthShell } from '../../components/auth/AuthShell';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const p = password.trim();
    const c = confirm.trim();
    if (p.length < 8) {
      Alert.alert('Password', 'Please choose a password that is at least 8 characters.');
      return;
    }
    if (p !== c) {
      Alert.alert('Password', 'Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p });
      if (error) throw error;

      Alert.alert('Password updated', 'You can now sign in with your new password.');
      await supabase.auth.signOut();
      router.replace('/(auth)/sign-in');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <AuthShell
      title="proxyme"
      subtitle="Set a new password"
      footer={
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')} className="items-center mt-2">
          <Text className="text-slate-600">Back to sign in</Text>
        </TouchableOpacity>
      }
    >
      <View>
        <Text className="text-slate-700 mb-2 ml-1" style={{ fontFamily: 'LibertinusSans-Regular' }}>
          New password
        </Text>
        <TextInput
          className="bg-white/80 border border-slate-200 rounded-2xl px-4 py-4 text-base mb-4 text-ink"
          placeholder="At least 8 characters"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {}}
          onFocus={(e) => {
            if (Platform.OS === 'web') e.stopPropagation();
          }}
        />

        <Text className="text-slate-700 mb-2 ml-1" style={{ fontFamily: 'LibertinusSans-Regular' }}>
          Confirm password
        </Text>
        <TextInput
          className="bg-white/80 border border-slate-200 rounded-2xl px-4 py-4 text-base mb-6 text-ink"
          placeholder="Repeat password"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
            void submit();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') e.stopPropagation();
          }}
        />

        <TouchableOpacity className="bg-black py-4 rounded-2xl items-center shadow-xl" onPress={() => void submit()} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg" style={{ fontFamily: 'LibertinusSans-Regular' }}>
              Update Password
            </Text>
          )}
        </TouchableOpacity>
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

