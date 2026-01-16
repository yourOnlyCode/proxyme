import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { AuthShell } from '../../components/auth/AuthShell';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { supabase } from '../../lib/supabase';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://www.proxyme.app',
      },
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Please check your inbox for email verification!');
      router.back();
    }
    setLoading(false);
  }

  const content = (
    <AuthShell
      title="proxyme"
      subtitle=""
      footer={
        <View className="flex-row justify-center mt-1">
          <Text className="text-slate-600">Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text className="font-bold text-ink">Sign In</Text>
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
          placeholder="youare@beautiful.com.com"
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
          placeholder="Create a password"
          placeholderTextColor="#94A3B8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
            void signUpWithEmail();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') e.stopPropagation();
          }}
        />

        <TouchableOpacity className="bg-black py-4 rounded-2xl items-center shadow-xl" onPress={() => void signUpWithEmail()} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg" style={{ fontFamily: 'LibertinusSans-Regular' }}>
              Create Account
            </Text>
          )}
        </TouchableOpacity>

        <SocialAuthButtons />

        <Text className="text-slate-500 text-xs mt-4 text-center">
          By continuing, you agree to our community standards and safety-first approach.
        </Text>
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
