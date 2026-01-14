import { IconSymbol } from '@/components/ui/icon-symbol';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Modal, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import { State, TapGestureHandler } from 'react-native-gesture-handler';

const getScreenDimensions = () => {
    const { width, height } = Dimensions.get('window');
    return { width: width || 0, height: height || 0 };
};

export function CameraModal({ 
    visible, 
    onClose, 
    onPhotoTaken,
    slideFromRight = false,
    source = 'status' // 'proxy' | 'status'
}: { 
    visible: boolean; 
    onClose: () => void; 
    onPhotoTaken: (uri: string) => void;
    slideFromRight?: boolean;
    source?: 'proxy' | 'status';
}) {
    const [screenDimensions, setScreenDimensions] = useState(getScreenDimensions());
    const SCREEN_WIDTH = Math.max(Number(screenDimensions.width) || 0, 1);
    const SCREEN_HEIGHT = Math.max(Number(screenDimensions.height) || 0, 1);
    
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const swipeAnim = useRef(new Animated.Value(0)).current;
    const isClosing = useRef(false);
    const toggleFacing = () => {
        setFacing((f) => (f === 'back' ? 'front' : 'back'));
    };
    
    // Update screen dimensions on mount and when window changes
    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', ({ window }) => {
            setScreenDimensions({ 
                width: Math.max(Number(window.width) || 0, 1), 
                height: Math.max(Number(window.height) || 0, 1) 
            });
        });
        return () => subscription?.remove();
    }, []);

    useEffect(() => {
        if (visible && slideFromRight) {
            // Slide in from right (for swipe gesture)
            const screenWidth = Number(SCREEN_WIDTH) || 0;
            if (screenWidth > 0) {
                slideAnim.setValue(-screenWidth);
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 260,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
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
        // Reset swipe animation when modal opens
        if (visible) {
            swipeAnim.setValue(0);
            isClosing.current = false;
        }
    }, [visible, slideFromRight, SCREEN_WIDTH]);

    // PanResponder for swipe gestures - recreate when source or capturedPhoto changes
    const panResponder = useMemo(
        () => PanResponder.create({
            onStartShouldSetPanResponder: () => !capturedPhoto, // Only respond when not in preview
            onMoveShouldSetPanResponder: (_, gestureState) => {
                if (capturedPhoto) return false;
                // For proxy source: detect horizontal swipe (left)
                if (source === 'proxy') {
                    return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
                }
                // For status source: detect vertical swipe (down)
                if (source === 'status') {
                    return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 10;
                }
                return false;
            },
            onPanResponderMove: (_, gestureState) => {
                if (isClosing.current) return;
                
                if (source === 'proxy') {
                    // Swipe left to close (positive dx means moving left)
                    if (gestureState.dx > 0) {
                        swipeAnim.setValue(gestureState.dx);
                    }
                } else if (source === 'status') {
                    // Swipe down to close (positive dy means moving down)
                    if (gestureState.dy > 0) {
                        swipeAnim.setValue(gestureState.dy);
                    }
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (isClosing.current) return;
                
                const threshold = 100;
                
                if (source === 'proxy' && gestureState.dx > threshold) {
                    // Swipe left completed - close modal
                    isClosing.current = true;
                    const screenWidth = Number(SCREEN_WIDTH) || 0;
                    Animated.timing(swipeAnim, {
                        toValue: screenWidth,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose();
                        swipeAnim.setValue(0);
                    });
                } else if (source === 'status' && gestureState.dy > threshold) {
                    // Swipe down completed - close modal
                    isClosing.current = true;
                    const screenHeight = Number(SCREEN_HEIGHT) || 0;
                    Animated.timing(swipeAnim, {
                        toValue: screenHeight,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose();
                        swipeAnim.setValue(0);
                    });
                } else {
                    // Snap back to original position
                    Animated.spring(swipeAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 50,
                        friction: 7,
                    }).start();
                }
            },
        }),
        [source, capturedPhoto, SCREEN_WIDTH, SCREEN_HEIGHT, swipeAnim, onClose]
    );

    if (!visible) {
        return null;
    }

    // Ensure screen dimensions are valid before rendering
    if (!SCREEN_WIDTH || !SCREEN_HEIGHT || SCREEN_WIDTH === 0 || SCREEN_HEIGHT === 0 || isNaN(SCREEN_WIDTH) || isNaN(SCREEN_HEIGHT)) {
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
                            style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                            resizeMode="contain"
                        />
                        <View className="absolute bottom-0 left-0 right-0 bg-black/60 p-6 pb-12">
                            <View className="flex-row justify-center">
                                <TouchableOpacity 
                                    onPress={handleRetake}
                                    className="bg-white/20 px-6 py-3 rounded-full mr-6"
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
                        style={{ width: Math.max(Number(SCREEN_WIDTH) || 0, 1), height: Math.max(Number(SCREEN_HEIGHT) || 0, 1) }}
                        resizeMode="contain"
                    />
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 p-6 pb-12">
                        <View className="flex-row justify-center">
                            <TouchableOpacity 
                                onPress={handleRetake}
                                className="bg-white/20 px-6 py-3 rounded-full mr-6"
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
        const transformStyle = source === 'proxy' 
            ? [{ translateX: Animated.add(slideAnim, swipeAnim) }]
            : [{ translateX: slideAnim }, { translateY: swipeAnim }];
        
        return (
            <Modal 
                visible={visible} 
                animationType="none" 
                transparent={false}
                statusBarTranslucent
            >
                <Animated.View 
                    className="flex-1 bg-black"
                    style={{ transform: transformStyle }}
                    {...panResponder.panHandlers}
                >
                    <TapGestureHandler
                        numberOfTaps={2}
                        onHandlerStateChange={({ nativeEvent }) => {
                            if (nativeEvent.state !== State.ACTIVE) return;
                            if (capturedPhoto) return;
                            toggleFacing();
                        }}
                    >
                        <View style={{ flex: 1 }}>
                            <CameraView
                                ref={cameraRef}
                                style={{ flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                                facing={facing}
                            />
                        </View>
                    </TapGestureHandler>

                    {/* Bottom Controls - Reorganized */}
                    <View className="absolute bottom-12 left-0 right-0 flex-row justify-center items-center px-4">
                        {/* X Button - Left of capture */}
                        <TouchableOpacity 
                            onPress={onClose}
                            className="bg-black/50 p-3 rounded-full mr-8"
                        >
                            <IconSymbol name="xmark" size={24} color="white" />
                        </TouchableOpacity>
                        
                        {/* Capture Button - Center */}
                        <TouchableOpacity 
                            onPress={takePicture}
                            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 items-center justify-center"
                        >
                            <View className="w-16 h-16 rounded-full bg-white" />
                        </TouchableOpacity>
                        
                        {/* Front/Back Toggle - Right of capture */}
                        <TouchableOpacity 
                            onPress={toggleFacing}
                            className="bg-black/50 p-3 rounded-full ml-8"
                        >
                            <IconSymbol name="arrow.triangle.2.circlepath" size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Modal>
        );
    }

    const transformStyle = source === 'status' 
        ? [{ translateY: swipeAnim }]
        : [];

    return (
        <Modal 
            visible={visible} 
            animationType="slide" 
            transparent={false}
            statusBarTranslucent
        >
            <Animated.View 
                className="flex-1 bg-black"
                style={{ transform: transformStyle }}
                {...panResponder.panHandlers}
            >
                <TapGestureHandler
                    numberOfTaps={2}
                    onHandlerStateChange={({ nativeEvent }) => {
                        if (nativeEvent.state !== State.ACTIVE) return;
                        if (capturedPhoto) return;
                        toggleFacing();
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <CameraView
                            ref={cameraRef}
                            style={{ flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                            facing={facing}
                        />
                    </View>
                </TapGestureHandler>

                {/* Bottom Controls - Reorganized */}
                <View className="absolute bottom-12 left-0 right-0 flex-row justify-center items-center px-4">
                    {/* X Button - Left of capture */}
                    <TouchableOpacity 
                        onPress={onClose}
                        className="bg-black/50 p-3 rounded-full mr-8"
                    >
                        <IconSymbol name="xmark" size={24} color="white" />
                    </TouchableOpacity>
                    
                    {/* Capture Button - Center */}
                    <TouchableOpacity 
                        onPress={takePicture}
                        className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 items-center justify-center"
                    >
                        <View className="w-16 h-16 rounded-full bg-white" />
                    </TouchableOpacity>
                    
                    {/* Front/Back Toggle - Right of capture */}
                    <TouchableOpacity 
                        onPress={toggleFacing}
                        className="bg-black/50 p-3 rounded-full ml-8"
                    >
                        <IconSymbol name="arrow.triangle.2.circlepath" size={24} color="white" />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Modal>
    );
}

