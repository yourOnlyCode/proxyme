import { IconSymbol } from '@/components/ui/icon-symbol';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useState, useRef } from 'react';
import { Modal, View, TouchableOpacity, Text, Image, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function CameraModal({ 
    visible, 
    onClose, 
    onPhotoTaken 
}: { 
    visible: boolean; 
    onClose: () => void; 
    onPhotoTaken: (uri: string) => void;
}) {
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

    if (!visible) {
        return null;
    }

    if (!permission) {
        return (
            <Modal visible={visible} animationType="slide" transparent>
                <View className="flex-1 bg-black items-center justify-center p-6">
                    <Text className="text-white text-lg">Loading camera...</Text>
                </View>
            </Modal>
        );
    }

    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide" transparent>
                <View className="flex-1 bg-black items-center justify-center p-6">
                    <Text className="text-white text-lg font-bold mb-4 text-center">
                        Camera permission is required
                    </Text>
                    <TouchableOpacity 
                        onPress={requestPermission}
                        className="bg-white px-6 py-3 rounded-full"
                    >
                        <Text className="text-black font-bold">Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={onClose}
                        className="mt-4"
                    >
                        <Text className="text-white">Cancel</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.8,
                    skipProcessing: false,
                });
                if (photo) {
                    // Get image dimensions to crop to screen aspect ratio
                    const { width: imgWidth, height: imgHeight } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                        Image.getSize(photo.uri, (w, h) => resolve({ width: w, height: h }), reject);
                    });
                    
                    // Screen aspect ratio (portrait)
                    const screenAspect = SCREEN_HEIGHT / SCREEN_WIDTH;
                    const imageAspect = imgHeight / imgWidth;
                    
                    let manipulations: any[] = [];
                    
                    // If image is wider than screen aspect, crop width (remove side borders)
                    if (imageAspect < screenAspect) {
                        const targetHeight = imgHeight;
                        const targetWidth = imgHeight / screenAspect;
                        const cropX = (imgWidth - targetWidth) / 2;
                        manipulations.push({
                            crop: {
                                originX: cropX,
                                originY: 0,
                                width: targetWidth,
                                height: targetHeight,
                            }
                        });
                    }
                    // If image is taller than screen aspect, crop height (remove top/bottom borders)
                    else if (imageAspect > screenAspect) {
                        const targetWidth = imgWidth;
                        const targetHeight = imgWidth * screenAspect;
                        const cropY = (imgHeight - targetHeight) / 2;
                        manipulations.push({
                            crop: {
                                originX: 0,
                                originY: cropY,
                                width: targetWidth,
                                height: targetHeight,
                            }
                        });
                    }
                    
                    // If using front camera, mirror the image to match preview
                    if (facing === 'front') {
                        manipulations.push({ flip: ImageManipulator.FlipType.Horizontal });
                    }
                    
                    let finalUri = photo.uri;
                    if (manipulations.length > 0) {
                        const manipulated = await ImageManipulator.manipulateAsync(
                            photo.uri,
                            manipulations,
                            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                        );
                        finalUri = manipulated.uri;
                    }
                    setCapturedPhoto(finalUri);
                }
            } catch (error) {
                console.error('Error taking picture:', error);
            }
        }
    };

    const handleUsePhoto = () => {
        if (capturedPhoto) {
            onPhotoTaken(capturedPhoto);
            setCapturedPhoto(null);
            onClose();
        }
    };

    const handleRetake = () => {
        setCapturedPhoto(null);
    };

    if (capturedPhoto) {
        return (
            <Modal visible={visible} animationType="slide" transparent>
                <View className="flex-1 bg-black">
                    <Image 
                        source={{ uri: capturedPhoto }} 
                        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                        resizeMode="contain"
                    />
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 p-6 pb-12">
                        <View className="flex-row justify-center space-x-6">
                            <TouchableOpacity 
                                onPress={handleRetake}
                                className="bg-white/20 px-6 py-3 rounded-full"
                            >
                                <Text className="text-white font-bold">Retake</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={handleUsePhoto}
                                className="bg-white px-6 py-3 rounded-full"
                            >
                                <Text className="text-black font-bold">Use Photo</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal 
            visible={visible} 
            animationType="slide" 
            transparent={false}
            statusBarTranslucent
        >
            <View className="flex-1 bg-black">
                <CameraView
                    ref={cameraRef}
                    style={{ flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                    facing={facing}
                />
                
                {/* Top Controls */}
                <View className="absolute top-12 left-0 right-0 flex-row justify-start items-center px-4">
                    <TouchableOpacity 
                        onPress={onClose}
                        className="bg-black/50 p-3 rounded-full"
                    >
                        <IconSymbol name="xmark" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Bottom Controls */}
                <View className="absolute bottom-12 left-0 right-0 flex-row justify-center items-center px-4">
                    <TouchableOpacity 
                        onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
                        className="bg-black/50 p-3 rounded-full mr-8"
                    >
                        <IconSymbol name="arrow.triangle.2.circlepath" size={24} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={takePicture}
                        className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 items-center justify-center"
                    >
                        <View className="w-16 h-16 rounded-full bg-white" />
                    </TouchableOpacity>
                    <View className="w-20" /> {/* Spacer for symmetry */}
                </View>
            </View>
        </Modal>
    );
}

