import React, { createContext, useContext, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Dimensions, SafeAreaView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IconSymbol } from '@/components/ui/icon-symbol';

type TutorialContextType = {
  startTutorial: () => void;
  resetTutorial: () => void;
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const STEPS = [
    {
        title: "Welcome to Proxy!",
        description: "Connect with people nearby in real-time. Let's take a quick tour.",
        target: "center",
        icon: "hand.wave.fill"
    },
    {
        title: "Proxy Tab",
        description: "Proxy is strictly local (300ft). Flip the switch to be visible to people right here, right now.",
        target: "bottom-left", 
        icon: "location.fill"
    },
    {
        title: "Status Updates",
        description: "Tap 'What're you up to?' to share your current status. It expires in 1 hour.",
        target: "top-left",
        icon: "bubble.left.and.bubble.right.fill"
    },
    {
        title: "City Tab",
        description: "Zoom out to see who is in your wider city area, even if they aren't right next to you.",
        target: "bottom-left-2",
        icon: "building.2.fill"
    },
    {
        title: "Connections",
        description: "Your chats, requests, and new connections live here.",
        target: "bottom-right-2",
        icon: "person.2.fill"
    },
    {
        title: "Profile",
        description: "Edit your profile, interests, and preferences here.",
        target: "bottom-right",
        icon: "person.fill"
    }
];

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    try {
      const hasSeen = await AsyncStorage.getItem('hasSeenTutorial');
      if (hasSeen !== 'true') {
        // Delay slightly to let app load
        setTimeout(() => setIsActive(true), 1000);
      }
    } catch (e) {
      console.error('Failed to load tutorial status');
    }
  };

  const finishTutorial = async () => {
    setIsActive(false);
    await AsyncStorage.setItem('hasSeenTutorial', 'true');
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      finishTutorial();
    }
  };

  const startTutorial = () => {
      setCurrentStep(0);
      setIsActive(true);
  };

  const resetTutorial = async () => {
      await AsyncStorage.removeItem('hasSeenTutorial');
      startTutorial();
  };

  const renderStep = () => {
      const step = STEPS[currentStep];
      const isLast = currentStep === STEPS.length - 1;

      return (
          <View className="bg-white p-6 rounded-3xl mx-6 shadow-2xl border border-gray-100 items-center">
              <View className="w-16 h-16 bg-blue-50 rounded-full items-center justify-center mb-4">
                  <IconSymbol name={step.icon as any} size={32} color="#2563EB" />
              </View>
              <Text className="text-2xl font-bold text-ink text-center mb-2">{step.title}</Text>
              <Text className="text-gray-500 text-center mb-6 leading-6">{step.description}</Text>
              
              <View className="flex-row space-x-3 w-full">
                  <TouchableOpacity 
                    onPress={finishTutorial} 
                    className="flex-1 py-3 bg-gray-100 rounded-xl items-center"
                  >
                      <Text className="text-gray-600 font-bold">Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={nextStep}
                    className="flex-1 py-3 bg-black rounded-xl items-center shadow-lg"
                  >
                      <Text className="text-white font-bold">{isLast ? "Get Started" : "Next"}</Text>
                  </TouchableOpacity>
              </View>

              <View className="flex-row mt-6 space-x-1.5">
                  {STEPS.map((_, i) => (
                      <View 
                        key={i} 
                        className={`h-1.5 rounded-full ${i === currentStep ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-200'}`} 
                      />
                  ))}
              </View>
          </View>
      );
  };

  return (
    <TutorialContext.Provider value={{ startTutorial, resetTutorial }}>
      {children}
      <Modal
        visible={isActive}
        transparent
        animationType="fade"
      >
          <View className="flex-1 bg-black/50 justify-center">
             {renderStep()}
          </View>
      </Modal>
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}

