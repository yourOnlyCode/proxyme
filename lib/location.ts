import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { Alert } from 'react-native';

export function useProxyLocation() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProxyActive, setIsProxyActive] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Initial fetch of proxy status
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
    }
  };

  const updateLocation = async (loc: Location.LocationObject) => {
    if (!user) return;
    
    // PostGIS format: POINT(longitude latitude)
    const point = `POINT(${loc.coords.longitude} ${loc.coords.latitude})`;
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        location: point,
        last_seen: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating location:', error);
    }
  };

  const toggleProxy = async (value: boolean) => {
    if (!user) return;

    if (value) {
      // Request permissions before enabling
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert('Permission Denied', 'We need your location to enable Proxy mode.');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      await updateLocation(location);
    }

    // Update status in DB
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

  return {
    location,
    errorMsg,
    isProxyActive,
    toggleProxy
  };
}

