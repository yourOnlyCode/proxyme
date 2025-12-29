import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [friendCode, setFriendCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          friend_code: friendCode.trim() || null,
        },
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
          style={{ width: 100, height: 100, borderRadius: 16 }}
          resizeMode="contain"
        />
        <Text className="text-2xl font-bold mt-4 text-center">Create Account</Text>
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
          className="border border-gray-300 rounded-lg p-4 text-base mb-4 text-black"
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
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
          placeholder="Friend Code (Optional)"
          placeholderTextColor="#6b7280"
          value={friendCode}
          onChangeText={setFriendCode}
          maxLength={6}
          keyboardType="number-pad"
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={() => {
            if (Platform.OS !== 'web') Keyboard.dismiss();
            signUpWithEmail();
          }}
          onFocus={(e) => {
            if (Platform.OS === 'web') {
              e.stopPropagation();
            }
          }}
        />
        
        <TouchableOpacity 
          className="bg-black py-4 rounded-lg items-center"
          onPress={signUpWithEmail}
          disabled={loading}
        >
          {loading ? (
             <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-lg">Sign Up</Text>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-600">Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text className="font-bold text-black">Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      </View>
    </Wrapper>
  );
}
