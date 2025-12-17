import { Platform } from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { supabase } from './supabase';

// REPLACE WITH YOUR ACTUAL REVENUECAT API KEYS
const API_KEYS = {
  apple: process.env.EXPO_PUBLIC_RC_APPLE_KEY || 'appl_placeholder',
  google: process.env.EXPO_PUBLIC_RC_GOOGLE_KEY || 'goog_placeholder',
};

export async function initPurchases(userId: string) {
  try {
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
    
    // Check if "verified" entitlement is active
    if (customerInfo.entitlements.active['verified']) {
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
        return customerInfo.entitlements.active['verified'] !== undefined;
    } catch (e) {
        console.error('Restore Error:', e);
        return false;
    }
}

// Sync RevenueCat status with Supabase
// This is important because other users view 'is_verified' from the DB, not RevenueCat
async function checkVerificationStatus(userId: string) {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        const isVerified = !!customerInfo.entitlements.active['verified'];

        // Update Supabase
        await supabase
            .from('profiles')
            .update({ is_verified: isVerified })
            .eq('id', userId);
            
    } catch (e) {
        console.error('Status Check Error:', e);
    }
}

