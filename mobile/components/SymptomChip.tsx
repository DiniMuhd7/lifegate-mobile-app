import React, { useEffect, useRef } from 'react';
import { Text, TouchableOpacity, Animated } from 'react-native';

interface SymptomChipProps {
  label: string;
  selected?: boolean;
  onPress?: (label: string) => void;
  delay?: number;
}

export const SymptomChip: React.FC<SymptomChipProps> = ({
  label,
  selected = false,
  onPress,
  delay = 0,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.93,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 6,
      }),
    ]).start();
    onPress?.(label);
  };

  return (
    <Animated.View
      style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}
      className="m-1.5"
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        className={`
          min-w-[130px] px-7 py-3.5 rounded-full items-center
          ${selected ? 'bg-teal-900' : 'bg-teal-600'}
        `}
        style={{
          shadowColor: '#1a6b5e',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: selected ? 0.35 : 0.2,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text
          className={`text-sm font-semibold tracking-wide ${selected ? 'text-teal-200' : 'text-white'}`}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
