import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { supabase } from './supabase';

// Configuration
const API_KEYS = {
  apple: 'test_eKtqXWJCYjHHHohwmVSIERwJpgU', // Using the Test Key provided
  google: 'test_eKtqXWJCYjHHHohwmVSIERwJpgU', // Assuming same key for now (usually different)
};

const ENTITLEMENT_ID = 'Proxy Pro'; // Exact spelling as requested

export async function initPurchases(userId: string) {
  try {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Enable debug logs

    if (Platform.OS === 'ios') {
      Purchases.configure({ apiKey: API_KEYS.apple, appUserID: userId });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: API_KEYS.google, appUserID: userId });
    }
    
    // Check initial status
    await checkVerificationStatus(userId);
  } catch (e) {
    console.error('RevenueCat Init Error:', e);
  }
}

// Deprecated in favor of RevenueCatUI, but kept for custom UI if needed
export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current && offerings.current.availablePackages.length > 0) {
      return offerings.current.availablePackages;
    }
  } catch (e) {
    console.error('Error fetching offerings:', e);
  }
  return [];
}

export async function purchasePackage(pack: PurchasesPackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pack);
    
    if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        return true;
    }
  } catch (e: any) {
    if (!e.userCancelled) {
        console.error('Purchase Error:', e);
        throw e;
    }
  }
  return false;
}

export async function restorePurchases() {
    try {
        const customerInfo = await Purchases.restorePurchases();
        return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    } catch (e) {
        console.error('Restore Error:', e);
        return false;
    }
}

export async function presentCustomerCenter() {
    try {
        const result = await RevenueCatUI.presentCustomerCenter();
        // Handle result if needed (e.g., if they restored purchases)
    } catch (e) {
        console.error('Error presenting Customer Center:', e);
    }
}

// Sync RevenueCat status with Supabase
export async function checkVerificationStatus(userId: string) {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        const isVerified = !!customerInfo.entitlements.active[ENTITLEMENT_ID];

        // Update Supabase
        await supabase
            .from('profiles')
            .update({ is_verified: isVerified })
            .eq('id', userId);
            
        return isVerified;
    } catch (e) {
        console.error('Status Check Error:', e);
        return false;
    }
}
