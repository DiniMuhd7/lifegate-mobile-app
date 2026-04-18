import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface GreetingSectionProps {
  userName?: string;
  /** Gradient start/end colours — defaults to teal when omitted */
  gradientColors?: [string, string];
  /** Short status label shown in the top-right badge */
  statusLabel?: string;
  /** Ionicons name to show alongside the status label */
  statusIcon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Name/title of the most recent case */
  lastReportedCase?: string;
  /** Formatted relative date of the last reported case (e.g. "Yesterday") */
  lastReportedDate?: string;
  /** Number of currently active cases */
  activeCases?: number;
  /** AI Health Insight text shown below the user's name */
  insightText?: string;
}

const getTimeGreeting = (): { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] } => {
  const hour = new Date().getHours();
  if (hour < 12) return { label: 'Good morning', icon: 'sunny-outline' };
  if (hour < 17) return { label: 'Good afternoon', icon: 'partly-sunny-outline' };
  return { label: 'Good evening', icon: 'moon-outline' };
};

export const GreetingSection: React.FC<GreetingSectionProps> = ({
  userName,
  gradientColors = ['#0AADA2', '#043B3C'],
  statusLabel = 'General Health',
  statusIcon = 'heart',
  lastReportedCase,
  lastReportedDate,
  activeCases,
  insightText,
}) => {
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
        colors={gradientColors}
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
            <Ionicons name={statusIcon} size={12} color="#fff" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{statusLabel}</Text>
          </View>
        </View>

        {/* Greeting + name */}
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', lineHeight: 32 }}>
          {displayName}! 👋
        </Text>
        <Text
          numberOfLines={2}
          style={{ fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.92)', marginTop: 4, lineHeight: 21 }}
        >
          {insightText ?? 'Drink 8+ glasses of water daily and maintain a balanced diet.'}
        </Text>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 14 }} />

        {/* Stats row — mirrors HealthStatusCard bottom section */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.6)',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Last Reported
            </Text>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 3 }}
              numberOfLines={1}
            >
              {lastReportedCase ?? '—'}
            </Text>
            {lastReportedDate && (
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
                {lastReportedDate}
              </Text>
            )}
          </View>
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: 16,
              borderLeftWidth: 1,
              borderLeftColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>
              {activeCases ?? 0}
            </Text>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>
              Active
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};
