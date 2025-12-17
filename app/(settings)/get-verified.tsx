import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useAuth } from '../../lib/auth';
import { checkVerificationStatus, initPurchases, presentCustomerCenter } from '../../lib/purchases';

export default function GetVerifiedScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (user) {
        initialize();
    }
  }, [user]);

  const initialize = async () => {
      if (!user) return;
      await initPurchases(user.id);
      const verified = await checkVerificationStatus(user.id);
      setIsVerified(verified);
      setIsLoaded(true);
  };

  const handlePaywallResult = async (result: string) => {
    switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
            if (user) {
                await checkVerificationStatus(user.id);
                Alert.alert("Success", "Welcome to Proxy Pro!");
                router.back();
            }
            return true;
        case PAYWALL_RESULT.CANCELLED:
        case PAYWALL_RESULT.ERROR:
        default:
            return false;
    }
  };

  if (!isLoaded) {
      return (
          <View className="flex-1 justify-center items-center bg-white">
              <ActivityIndicator size="large" color="#2962FF" />
          </View>
      );
  }

  // If already verified, show management screen (Customer Center)
  if (isVerified) {
      return (
          <View className="flex-1 bg-white">
              {/* Modal Grabber */}
              <View className="items-center pt-2 pb-2">
                  <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </View>

              <View className="flex-1 justify-center items-center p-6">
                  <Text className="text-3xl font-extrabold mb-4 text-business">You are Proxy Pro!</Text>
                  <Text className="text-gray-500 mb-8 text-center text-lg leading-6">
                      You have access to all premium features and your verification badge is active.
                  </Text>

                  <TouchableOpacity 
                      onPress={presentCustomerCenter}
                      className="bg-business py-4 px-8 rounded-2xl mb-4 w-full shadow-lg shadow-business/30"
                  >
                      <Text className="text-white text-center font-bold text-lg">Manage Subscription</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                      onPress={() => router.back()}
                      className="py-4"
                  >
                      <Text className="text-gray-400 font-medium">Go Back</Text>
                  </TouchableOpacity>
              </View>
          </View>
      );
  }

  // Otherwise, show Paywall
  return (
      <View className="flex-1 bg-white">
        {/* Modal Grabber (Overlay on top of Paywall if needed, but Paywall usually handles its own header. 
           We'll wrap it just in case we want a custom header, but RC UI is full screen usually.
           Actually, for a modal presentation, a grabber is nice above the content.) */}
        
        <View className="items-center pt-2 pb-2 bg-white z-10">
            <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </View>

        <View className="flex-1">
            <RevenueCatUI.Paywall 
                onPurchaseCompleted={({ customerInfo }) => {
                    // Check if entitlement unlocked
                    if (customerInfo.entitlements.active["Proxy Pro"]) {
                        handlePaywallResult(PAYWALL_RESULT.PURCHASED);
                    }
                }}
                onRestoreCompleted={({ customerInfo }) => {
                    if (customerInfo.entitlements.active["Proxy Pro"]) {
                        handlePaywallResult(PAYWALL_RESULT.RESTORED);
                    } else {
                        Alert.alert("No Subscription Found", "We couldn't find an active subscription to restore.");
                    }
                }}
                options={{
                    displayCloseButton: false, // We have our own navigation/grabber context
                }}
            />
        </View>
      </View>
  );
}
