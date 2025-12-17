import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type Photo = {
  id: string;
  image_url: string;
  display_order: number;
};

interface ProfileGalleryProps {
  userId: string;
  onSetAvatar: (path: string) => void;
}

export default function ProfileGallery({ userId, onSetAvatar }: ProfileGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [userId]);

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from('profile_photos')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    
    if (data) setPhotos(data);
  };

  const uploadPhotos = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limit Reached', 'You can only upload up to 5 photos.');
      return;
    }

    try {
      setUploading(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsMultipleSelection: true,
        selectionLimit: 5 - photos.length,
        quality: 0.5,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const uploadPromises = result.assets.map(async (asset, index) => {
          const fileExt = asset.uri.split('.').pop();
          const fileName = `${userId}/${Date.now()}_${index}.${fileExt}`;
          
          const formData = new FormData();
          formData.append('file', {
            uri: asset.uri,
            name: fileName,
            type: asset.mimeType || 'image/jpeg',
          } as any);

          const { error: uploadError } = await supabase.storage
            .from('avatars') 
            .upload(fileName, formData, {
              contentType: asset.mimeType || 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          return {
              user_id: userId,
              image_url: fileName,
              display_order: photos.length + index,
          };
      });

      const newPhotos = await Promise.all(uploadPromises);

      const { error: dbError } = await supabase
        .from('profile_photos')
        .insert(newPhotos);

      if (dbError) throw dbError;

      fetchPhotos();

    } catch (error) {
        if (error instanceof Error) {
            Alert.alert('Upload Failed', error.message);
        }
    } finally {
      setUploading(false);
    }
  };

  const makeCover = async (selectedPhoto: Photo) => {
      // Move selected photo to index 0, shift others down
      const otherPhotos = photos.filter(p => p.id !== selectedPhoto.id);
      const reordered = [selectedPhoto, ...otherPhotos].map((p, index) => ({
          ...p,
          display_order: index
      }));

      // Optimistic update
      setPhotos(reordered);

      // Update DB
      // We need to update each row. Supabase upsert requires primary keys.
      const updates = reordered.map(p => ({
          id: p.id,
          user_id: userId,
          image_url: p.image_url,
          display_order: p.display_order
      }));

      const { error } = await supabase.from('profile_photos').upsert(updates);
      
      if (error) {
          Alert.alert('Error', 'Failed to update cover photo.');
          fetchPhotos(); // Revert on error
      } else {
          Alert.alert('Success', 'Cover photo updated!');
      }
  };

  const handlePhotoPress = (photo: Photo) => {
      Alert.alert('Photo Options', 'Select an action:', [
          { text: 'Cancel', style: 'cancel' },
          { 
              text: 'Set as Profile Picture', 
              onPress: () => onSetAvatar(photo.image_url) 
          },
          { 
              text: 'Make Cover Photo', 
              onPress: () => makeCover(photo) 
          },
          { 
              text: 'Delete', 
              style: 'destructive',
              onPress: () => deletePhoto(photo.id, photo.image_url)
          }
      ]);
  };

  const deletePhoto = async (photoId: string, path: string) => {
      await supabase.storage.from('avatars').remove([path]);
      await supabase.from('profile_photos').delete().eq('id', photoId);
      fetchPhotos();
  };

  return (
    <View className="mt-6">
      <Text className="text-lg font-bold mb-3">Gallery ({photos.length}/5)</Text>
      <Text className="text-gray-400 text-xs mb-3">
          First photo is your Cover Photo. Tap to manage.
      </Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
        {photos.map((photo, index) => (
          <TouchableOpacity 
            key={photo.id} 
            className="mr-3 relative"
            onPress={() => handlePhotoPress(photo)}
          >
            <PhotoImage path={photo.image_url} />
            {index === 0 && (
                <View className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded">
                    <Text className="text-white text-[10px] font-bold">COVER</Text>
                </View>
            )}
          </TouchableOpacity>
        ))}

        {photos.length < 5 && (
          <TouchableOpacity 
            className="w-32 h-40 bg-gray-200 rounded-lg items-center justify-center border-2 border-dashed border-gray-400"
            onPress={uploadPhotos}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-gray-500 font-bold text-3xl">+</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function PhotoImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (path) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        setUrl(data.publicUrl);
    }
  }, [path]);

  if (!url) return <View className="w-32 h-40 bg-gray-300 rounded-lg animate-pulse" />;

  return (
    <Image 
      source={url} 
      style={{ width: 128, height: 160, borderRadius: 8, backgroundColor: '#d1d5db' }}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
    />
  );
}
