import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { useAuthStore } from 'stores/auth-store';

interface GreetingSectionProps {
  userName?: string;
}

export const GreetingSection: React.FC<GreetingSectionProps> = ({ userName }) => {
  const headingFade = useRef(new Animated.Value(0)).current;
  const headingSlide = useRef(new Animated.Value(30)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;

   useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headingFade, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(headingSlide, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(subtitleFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View className="px-7 pt-8 items-center">
      <Animated.Text
        style={{ opacity: headingFade, transform: [{ translateY: headingSlide }] }}
        className="text-4xl font-extrabold text-teal-900 text-center leading-tight tracking-tight mb-5"
      >
        {`Hello ${userName},\nHow are you\nfeeling today?`}
      </Animated.Text>

      <Animated.Text
        style={{ opacity: subtitleFade }}
        className="text-sm text-teal-700 text-center leading-relaxed"
      >
        {"I'll ask you a few questions to better\nunderstand your symptoms."}
      </Animated.Text>
    </View>
  );
};