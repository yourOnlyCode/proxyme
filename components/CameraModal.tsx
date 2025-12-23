import { IconSymbol } from '@/components/ui/icon-symbol';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, Modal, Text, TouchableOpacity, View } from 'react-native';

const getScreenDimensions = () => {
    const { width, height } = Dimensions.get('window');
    return { width: width || 0, height: height || 0 };
};

export function CameraModal({ 
    visible, 
    onClose, 
    onPhotoTaken,
    slideFromRight = false
}: { 
    visible: boolean; 
    onClose: () => void; 
    onPhotoTaken: (uri: string) => void;
    slideFromRight?: boolean;
}) {
    const [screenDimensions, setScreenDimensions] = useState(getScreenDimensions());
    const SCREEN_WIDTH = screenDimensions.width;
    const SCREEN_HEIGHT = screenDimensions.height;
    
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const slideAnim = useRef(new Animated.Value(0)).current;
    
    // Update screen dimensions on mount and when window changes
    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', ({ window }) => {
            setScreenDimensions({ width: window.width || 0, height: window.height || 0 });
        });
        return () => subscription?.remove();
    }, []);

    useEffect(() => {
        if (visible && slideFromRight) {
            // Slide in from right (for swipe gesture)
            const screenWidth = Number(SCREEN_WIDTH) || 0;
            if (screenWidth > 0) {
                slideAnim.setValue(-screenWidth);
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 7,
                }).start();
            }
        } else if (!visible && slideFromRight) {
            // Reset position when hidden (only if using slide animation)
            const screenWidth = Number(SCREEN_WIDTH) || 0;
            if (screenWidth > 0) {
                slideAnim.setValue(-screenWidth);
            }
        } else if (!slideFromRight) {
            // When not using slide animation, ensure it's at 0
            slideAnim.setValue(0);
        }
    }, [visible, slideFromRight, SCREEN_WIDTH]);

    if (!visible) {
        return null;
    }

    // Ensure screen dimensions are valid before rendering
    if (!SCREEN_WIDTH || !SCREEN_HEIGHT || SCREEN_WIDTH === 0 || SCREEN_HEIGHT === 0) {
        return (
            <Modal visible={visible} animationType="none" transparent>
                <View className="flex-1 bg-black items-center justify-center">
                    <Text className="text-white text-lg">Loading...</Text>
                </View>
            </Modal>
        );
    }

    if (!permission) {
        if (slideFromRight) {
            return (
                <Modal visible={visible} animationType="none" transparent>
                    <Animated.View 
                        className="flex-1 bg-black items-center justify-center p-6"
                        style={{ transform: [{ translateX: slideAnim }] }}
                    >
                        <Text className="text-white text-lg">Loading camera...</Text>
                    </Animated.View>
                </Modal>
            );
        }
        return (
            <Modal visible={visible} animationType="none" transparent>
                <View className="flex-1 bg-black items-center justify-center p-6">
                    <Text className="text-white text-lg">Loading camera...</Text>
                </View>
            </Modal>
        );
    }

    if (!permission.granted) {
        if (slideFromRight) {
            return (
                <Modal visible={visible} animationType="none" transparent>
                    <Animated.View 
                        className="flex-1 bg-black items-center justify-center p-6"
                        style={{ transform: [{ translateX: slideAnim }] }}
                    >
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
                    </Animated.View>
                </Modal>
            );
        }
        return (
            <Modal visible={visible} animationType="none" transparent>
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
        if (slideFromRight) {
            return (
                <Modal visible={visible} animationType="none" transparent>
                    <Animated.View 
                        className="flex-1 bg-black"
                        style={{ transform: [{ translateX: slideAnim }] }}
                    >
                        <Image 
                            source={{ uri: capturedPhoto }} 
                            style={{ width: Number(SCREEN_WIDTH) || 0, height: Number(SCREEN_HEIGHT) || 0 }}
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
                    </Animated.View>
                </Modal>
            );
        }
        return (
            <Modal visible={visible} animationType="none" transparent>
                <View className="flex-1 bg-black">
                    <Image 
                        source={{ uri: capturedPhoto }} 
                        style={{ width: Number(SCREEN_WIDTH) || 0, height: Number(SCREEN_HEIGHT) || 0 }}
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

    if (slideFromRight) {
        return (
            <Modal 
                visible={visible} 
                animationType="none" 
                transparent={false}
                statusBarTranslucent
            >
                <Animated.View 
                    className="flex-1 bg-black"
                    style={{ transform: [{ translateX: slideAnim }] }}
                >
                    <CameraView
                        ref={cameraRef}
                        style={{ flex: 1, width: Number(SCREEN_WIDTH) || 0, height: Number(SCREEN_HEIGHT) || 0 }}
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
                </Animated.View>
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
                    style={{ flex: 1, width: Number(SCREEN_WIDTH) || 0, height: Number(SCREEN_HEIGHT) || 0 }}
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

