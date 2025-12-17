import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '../../lib/auth';
import { getOfferings, initPurchases, purchasePackage, restorePurchases } from '../../lib/purchases';

export default function GetVerifiedScreen() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) {
        initPurchases(user.id);
        loadOfferings();
    }
  }, [user]);

  const loadOfferings = async () => {
      setLoading(true);
      const offerings = await getOfferings();
      setPackages(offerings);
      setLoading(false);
  };

  const handlePurchase = async (pack: PurchasesPackage) => {
      setPurchasing(true);
      try {
          const success = await purchasePackage(pack);
          if (success) {
              Alert.alert('Success', 'You are now Verified!');
              router.back();
          }
      } catch (e) {
          // Error handled in lib
      } finally {
          setPurchasing(false);
      }
  };

  const handleRestore = async () => {
      setPurchasing(true);
      const success = await restorePurchases();
      setPurchasing(false);
      if (success) {
          Alert.alert('Success', 'Purchases restored.');
          router.back();
      } else {
          Alert.alert('Info', 'No active subscriptions found.');
      }
  };

  if (loading) return <View className="flex-1 justify-center bg-white"><ActivityIndicator size="large" color="black" /></View>;

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="items-center pt-12 pb-8 px-6">
          <View className="w-24 h-24 bg-blue-500 rounded-full items-center justify-center mb-6 shadow-lg">
              <IconSymbol name="checkmark.seal.fill" size={48} color="white" />
          </View>
          
          <Text className="text-3xl font-extrabold mb-2 text-center">Get Verified</Text>
          <Text className="text-gray-500 text-center text-lg mb-8 leading-6">
              Stand out from the crowd and show others you are real.
          </Text>

          <View className="w-full bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100">
              <FeatureItem text="Blue Checkmark on Profile" />
              <FeatureItem text="Priority in City Feed" />
              <FeatureItem text="Exclusive 'Verified' Badge" />
              <FeatureItem text="Support Independent Developers" />
          </View>

          {packages.length > 0 ? (
              packages.map((pack) => (
                  <TouchableOpacity
                    key={pack.identifier}
                    onPress={() => handlePurchase(pack)}
                    disabled={purchasing}
                    className="w-full bg-black py-4 rounded-xl items-center mb-4 shadow-md"
                  >
                      {purchasing ? (
                          <ActivityIndicator color="white" />
                      ) : (
                          <View>
                              <Text className="text-white font-bold text-lg">
                                  Subscribe for {pack.product.priceString}/mo
                              </Text>
                              <Text className="text-gray-400 text-xs text-center mt-1">
                                  Cancel anytime
                              </Text>
                          </View>
                      )}
                  </TouchableOpacity>
              ))
          ) : (
              <View className="bg-red-50 p-4 rounded-lg mb-4">
                  <Text className="text-red-500 text-center">
                      No products found. Please configure RevenueCat.
                  </Text>
              </View>
          )}

          <TouchableOpacity onPress={handleRestore} className="py-2">
              <Text className="text-gray-400 font-semibold">Restore Purchases</Text>
          </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function FeatureItem({ text }: { text: string }) {
    return (
        <View className="flex-row items-center mb-4">
            <View className="bg-blue-100 p-1 rounded-full mr-3">
                <IconSymbol name="checkmark" size={12} color="#3B82F6" />
            </View>
            <Text className="text-gray-700 font-medium text-base">{text}</Text>
        </View>
    );
}

