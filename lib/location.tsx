import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './auth';
import { isReviewUser } from './reviewMode';
import { supabase } from './supabase';

type LocationContextType = {
  location: Location.LocationObject | null;
  address: Location.LocationGeocodedAddress | null;
  errorMsg: string | null;
  isProxyActive: boolean;
  toggleProxy: (value: boolean) => Promise<void>;
};

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState<Location.LocationGeocodedAddress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProxyActive, setIsProxyActive] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchProxyStatus();
    }
  }, [user]);

  const fetchProxyStatus = async () => {
    if (!user) return;
    // Review accounts should never broadcast their location or be visible to real users.
    if (isReviewUser(user)) {
      setIsProxyActive(false);
      setLocation(null);
      setAddress(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('is_proxy_active')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setIsProxyActive(data.is_proxy_active);
      if (data.is_proxy_active) {
          refreshLocation();
      }
    }
  };

  const refreshLocation = async () => {
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setErrorMsg('Permission to access location was denied');
            return;
          }
          let loc = await Location.getCurrentPositionAsync({});
          setLocation(loc);
          await updateLocation(loc);
      } catch (e) {
          console.log("Error refreshing location:", e);
      }
  };

  const updateLocation = async (loc: Location.LocationObject) => {
    if (!user) return;
    // Review accounts should never write their location to the backend.
    if (isReviewUser(user)) return;
    
    const point = `POINT(${loc.coords.longitude} ${loc.coords.latitude})`;
    
    let updateData: any = { 
        location: point,
        last_seen: new Date().toISOString()
    };

    try {
        const reverse = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
        });
        
        if (reverse && reverse.length > 0) {
            const addr = reverse[0];
            setAddress(addr);
            
            // Persist only broad location fields; keep street-level details local (avoid storing exact address strings).
            if (addr.city) updateData.city = addr.city;
            if (addr.region) updateData.state = addr.region;
        }
    } catch (e) {
        console.log("Error reverse geocoding:", e);
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (error) {
      console.error('Error updating location:', error);
    }
  };

  const toggleProxy = async (value: boolean) => {
    if (!user) return;
    // Review accounts should never become visible.
    if (isReviewUser(user)) {
      setIsProxyActive(false);
      setLocation(null);
      setAddress(null);
      // Best-effort: force server-side off too, in case it was ever enabled.
      try {
        await supabase.from('profiles').update({ is_proxy_active: false, location: null }).eq('id', user.id);
      } catch {
        // ignore
      }
      Alert.alert('Proxy disabled', 'This review account can’t appear to real users.');
      return;
    }

    if (value) {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert('Permission Denied', 'We need your location to enable Proxy mode.');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      await updateLocation(loc);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_proxy_active: value })
      .eq('id', user.id);

    if (!error) {
      setIsProxyActive(value);
    } else {
      Alert.alert('Error', 'Failed to update Proxy status');
    }
  };

  return (
    <LocationContext.Provider value={{ location, address, errorMsg, isProxyActive, toggleProxy }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useProxyLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useProxyLocation must be used within a LocationProvider');
  }
  return context;
}
