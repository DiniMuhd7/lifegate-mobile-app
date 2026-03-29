import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';

interface GreetingSectionProps {
  userName?: string;
}

const getTimeGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const GreetingSection: React.FC<GreetingSectionProps> = ({ userName }) => {
  const headingFade = useRef(new Animated.Value(0)).current;
  const headingSlide = useRef(new Animated.Value(30)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;

  const displayName = userName ? userName.split(' ')[0] : 'there';
  const greeting = getTimeGreeting();

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
    <View className="px-4 items-center">
      <Animated.Text
        style={{ opacity: headingFade, transform: [{ translateY: headingSlide }] }}
        className="text-4xl font-extrabold text-teal-900 text-center leading-tight tracking-tight mb-4"
      >
        {`${greeting},\n${displayName}! 👋`}
      </Animated.Text>

      <Animated.Text
        style={{ opacity: subtitleFade }}
        className="text-sm text-teal-700 text-center leading-relaxed"
      >
        {'How are you feeling today?\nDescribe your symptoms or pick a topic below.'}
      </Animated.Text>
    </View>
  );
};
