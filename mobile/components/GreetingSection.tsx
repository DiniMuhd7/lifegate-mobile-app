import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface GreetingSectionProps {
  userName?: string;
}

const getTimeGreeting = (): { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] } => {
  const hour = new Date().getHours();
  if (hour < 12) return { label: 'Good morning', icon: 'sunny-outline' };
  if (hour < 17) return { label: 'Good afternoon', icon: 'partly-sunny-outline' };
  return { label: 'Good evening', icon: 'moon-outline' };
};

export const GreetingSection: React.FC<GreetingSectionProps> = ({ userName }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  const displayName = userName ? userName.split(' ')[0] : 'there';
  const { label: greeting, icon: timeIcon } = getTimeGreeting();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <LinearGradient
        colors={['#0AADA2', '#043B3C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          padding: 20,
          marginBottom: 4,
        }}
      >
        {/* Top row: time-of-day icon + AI badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Ionicons name={timeIcon} size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{greeting}</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Ionicons name="heart" size={12} color="#fff" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>General Health</Text>
          </View>
        </View>

        {/* Greeting + name */}
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', lineHeight: 32 }}>
          {displayName}! 👋
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 20 }}>
          How are you feeling today? I'm here to help with your health questions.
        </Text>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 14 }} />

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[
            { icon: 'shield-checkmark-outline' as React.ComponentProps<typeof Ionicons>['name'], label: 'AI-Powered' },
            { icon: 'medical-outline' as React.ComponentProps<typeof Ionicons>['name'], label: 'Doctor Reviewed' },
            { icon: 'lock-closed-outline' as React.ComponentProps<typeof Ionicons>['name'], label: 'Private & Secure' },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Ionicons name={item.icon} size={16} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'center' }}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </Animated.View>
  );
};
