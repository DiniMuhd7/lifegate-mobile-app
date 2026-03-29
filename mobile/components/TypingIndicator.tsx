import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const TypingIndicator = () => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const labelAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in label
    Animated.timing(labelAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Staggered bounce per dot
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: -6, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 160),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 6,
      }}
    >
      {/* AI Avatar */}
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: '#0f766e',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
          marginBottom: 2,
        }}
      >
        <Ionicons name="pulse" size={15} color="white" />
      </View>

      {/* Bubble */}
      <View
        style={{
          backgroundColor: '#f0fdfa',
          borderWidth: 1,
          borderColor: '#ccfbf1',
          borderRadius: 20,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Animated.Text
          style={{
            fontSize: 11,
            color: '#0f766e',
            fontStyle: 'italic',
            marginBottom: 8,
            opacity: labelAnim,
          }}
        >
          LifeGate is thinking...
        </Animated.Text>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-end' }}>
          {dots.map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: '#0f766e',
                transform: [{ translateY: dot }],
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
};
