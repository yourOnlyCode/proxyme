import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signInWithEmail() {
    setLoading(true);
    console.log('Attempting login with:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log('Login result:', { data, error });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
       // Router replace is handled by the auth listener in _layout, 
       // but we can force it here just in case.
       router.replace('/(tabs)');
    }
    setLoading(false);
  }

  const Wrapper = Platform.OS === 'web' ? View : TouchableWithoutFeedback;
  const wrapperProps = Platform.OS === 'web' 
    ? {} 
    : { onPress: Keyboard.dismiss, accessible: false };

  return (
    <Wrapper {...wrapperProps}>
      <View className="flex-1 justify-center px-8 bg-white">
      <View className="items-center mb-8">
        <Image 
          source={require('../../assets/images/icon.png')} 
          style={{ width: 120, height: 120, borderRadius: 20 }}
          resizeMode="contain"
        />
      </View>
      
      <View>
        <TextInput
          className="border border-gray-300 rounded-lg p-4 text-base mb-4 text-black"
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') {
              e.stopPropagation();
            }
          }}
        />
        <TextInput
          className="border border-gray-300 rounded-lg p-4 text-base mb-6 text-black"
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
            signInWithEmail();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') {
              e.stopPropagation();
            }
          }}
        />
        
        <TouchableOpacity 
          className="bg-black py-4 rounded-lg items-center"
          onPress={signInWithEmail}
          disabled={loading}
        >
          {loading ? (
             <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">Sign In</Text>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-600">Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text className="font-bold text-black">Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      </View>
    </Wrapper>
  );
}
