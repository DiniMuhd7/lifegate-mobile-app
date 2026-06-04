import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface BackgroundProps {
  children: React.ReactNode;
}

export const Background: React.FC<BackgroundProps> = ({ children }) => {
  return (
    <LinearGradient
      colors={['#d4eee9', '#c2e4de', '#e8f5f2', '#cdeae4']}
      locations={[0, 0.25, 0.6, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      {/* Top-right radial glow blob */}
      <View style={{ position: 'absolute', width: 288, height: 288, borderRadius: 144, backgroundColor: 'rgba(255,255,255,0.30)', top: -64, right: -64 }} />
      {/* Bottom-left soft teal blob */}
      {/* <View className="absolute w-52 h-52 rounded-full bg-teal-600/10 bottom-24 -left-12" /> */}
      {children}
    </LinearGradient>
  );
};
