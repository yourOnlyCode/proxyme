import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './auth';
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
          // On web, requestForegroundPermissionsAsync relies on browser API
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
          setErrorMsg('Could not fetch location');
      }
  };

  const updateLocation = async (loc: Location.LocationObject) => {
    if (!user) return;
    
    const point = `POINT(${loc.coords.longitude} ${loc.coords.latitude})`;
    
    let updateData: any = { 
        location: point,
        last_seen: new Date().toISOString()
    };

    // Reverse geocoding is NOT supported on web by expo-location
    // We skip it for now. In a real production app, we'd use a 3rd party API (Google Maps, OpenCage) here.
    // For now, we just don't set city/state/street.
    
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

    if (value) {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          Alert.alert('Permission Denied', 'We need your location to enable Proxy mode.');
          return;
        }

        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        await updateLocation(loc);
      } catch (e) {
         console.error('Location error:', e);
         Alert.alert('Error', 'Could not access location');
         return;
      }
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

