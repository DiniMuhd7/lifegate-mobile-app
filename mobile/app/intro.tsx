/**
 * App Intro / Onboarding Screen
 *
 * Shown only on first launch. Uses AsyncStorage to track completion.
 * After finishing, navigates to /welcome and never shows again.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Dimensions,
  Animated,
  StatusBar,
  ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Line, Rect, Polygon, G, Ellipse } from 'react-native-svg';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const INTRO_SEEN_KEY = '@lifegate_intro_seen';
const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// SVG Illustrations  (240 × 240 viewBox)
// ─────────────────────────────────────────────────────────────────────────────

/** Slide 1 – Heart with ECG pulse line */
const HealthIllustration: React.FC = () => (
  <Svg width={230} height={230} viewBox="0 0 240 240">
    {/* Decorative rings */}
    <Circle cx="120" cy="120" r="105" fill="rgba(255,255,255,0.06)" />
    <Circle cx="120" cy="120" r="82"  fill="rgba(255,255,255,0.10)" />

    {/* Heart shape */}
    <Path
      d="M120 175 C55 138 36 94 36 74 C36 50 57 35 80 35 C96 35 110 44 120 57 C130 44 144 35 160 35 C183 35 204 50 204 74 C204 94 185 138 120 175Z"
      fill="white"
      opacity="0.92"
    />

    {/* ECG / pulse line drawn over the heart */}
    <Path
      d="M62 120 L82 120 L91 96 L101 144 L109 107 L118 120 L145 120 L153 101 L163 139 L172 120 L184 120"
      stroke="#0AADA2"
      strokeWidth="3.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Small glowing dot at the live point */}
    <Circle cx="184" cy="120" r="5" fill="#0AADA2" />
    <Circle cx="184" cy="120" r="9" fill="#0AADA2" opacity="0.25" />
  </Svg>
);

/** Slide 2 – Neural-network / AI brain pattern */
const AIIllustration: React.FC = () => (
  <Svg width={230} height={230} viewBox="0 0 240 240">
    <Circle cx="120" cy="120" r="105" fill="rgba(255,255,255,0.06)" />
    <Circle cx="120" cy="120" r="82"  fill="rgba(255,255,255,0.10)" />

    {/* Hexagonal frame */}
    <Polygon
      points="120,44 178,78 178,146 120,180 62,146 62,78"
      fill="rgba(255,255,255,0.10)"
      stroke="rgba(255,255,255,0.35)"
      strokeWidth="1.8"
    />

    {/* Connection lines */}
    <Line x1="120" y1="112" x2="68"  y2="88"  stroke="rgba(255,255,255,0.40)" strokeWidth="1.4" />
    <Line x1="120" y1="112" x2="172" y2="88"  stroke="rgba(255,255,255,0.40)" strokeWidth="1.4" />
    <Line x1="120" y1="112" x2="68"  y2="144" stroke="rgba(255,255,255,0.40)" strokeWidth="1.4" />
    <Line x1="120" y1="112" x2="172" y2="144" stroke="rgba(255,255,255,0.40)" strokeWidth="1.4" />
    <Line x1="120" y1="112" x2="120" y2="162" stroke="rgba(255,255,255,0.40)" strokeWidth="1.4" />

    {/* Peripheral nodes */}
    <Circle cx="68"  cy="88"  r="10" fill="rgba(255,255,255,0.65)" />
    <Circle cx="172" cy="88"  r="10" fill="rgba(255,255,255,0.65)" />
    <Circle cx="68"  cy="144" r="10" fill="rgba(255,255,255,0.65)" />
    <Circle cx="172" cy="144" r="10" fill="rgba(255,255,255,0.65)" />
    <Circle cx="120" cy="162" r="10" fill="rgba(255,255,255,0.65)" />

    {/* Central node */}
    <Circle cx="120" cy="112" r="22" fill="white" />

    {/* Plus cross inside central node */}
    <Path
      d="M112 112 L128 112 M120 104 L120 120"
      stroke="#0AADA2"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </Svg>
);

/** Slide 3 – Doctor / stethoscope icon */
const PhysicianIllustration: React.FC = () => (
  <Svg width={230} height={230} viewBox="0 0 240 240">
    <Circle cx="120" cy="120" r="105" fill="rgba(255,255,255,0.06)" />
    <Circle cx="120" cy="120" r="82"  fill="rgba(255,255,255,0.10)" />

    {/* Medical cross (two overlapping rounded rects) */}
    <Rect x="103" y="56"  width="34" height="128" rx="10" fill="white" opacity="0.90" />
    <Rect x="56"  y="103" width="128" height="34"  rx="10" fill="white" opacity="0.90" />

    {/* Stethoscope arc overlay */}
    <Path
      d="M92 86 Q70 86 70 108 Q70 136 96 136 Q124 136 124 112"
      stroke="#0AADA2"
      strokeWidth="4.5"
      fill="none"
      strokeLinecap="round"
    />
    {/* Chest piece circle */}
    <Circle cx="124" cy="112" r="8" fill="#0AADA2" />
    <Circle cx="124" cy="112" r="4" fill="white" />
  </Svg>
);

/** Slide 4 – Phone with upward-trend chart */
const WellnessIllustration: React.FC = () => (
  <Svg width={230} height={230} viewBox="0 0 240 240">
    <Circle cx="120" cy="120" r="105" fill="rgba(255,255,255,0.06)" />
    <Circle cx="120" cy="120" r="82"  fill="rgba(255,255,255,0.10)" />

    {/* Phone frame */}
    <Rect x="76"  y="52"  width="88" height="148" rx="16" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="2.2" />
    {/* Screen area */}
    <Rect x="84"  y="66"  width="72" height="100" rx="5"  fill="rgba(255,255,255,0.12)" />

    {/* Grid lines */}
    <Line x1="88" y1="100" x2="152" y2="100" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
    <Line x1="88" y1="116" x2="152" y2="116" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
    <Line x1="88" y1="132" x2="152" y2="132" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />

    {/* Trend area fill */}
    <Path
      d="M88 148 L100 140 L114 128 L124 118 L137 108 L150 94 L152 94 L152 148 Z"
      fill="rgba(255,255,255,0.18)"
    />

    {/* Trend line */}
    <Path
      d="M88 148 L100 140 L114 128 L124 118 L137 108 L150 94"
      stroke="white"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Data point dots */}
    {[
      [88, 148], [100, 140], [114, 128],
      [124, 118], [137, 108], [150, 94],
    ].map(([cx, cy], i) => (
      <Circle key={i} cx={cx} cy={cy} r="4" fill="white" />
    ))}

    {/* Up-arrow badge */}
    <Circle cx="158" cy="86" r="13" fill="rgba(255,255,255,0.25)" />
    <Path
      d="M154 90 L158 82 L162 90"
      stroke="white"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Line x1="158" y1="82" x2="158" y2="92" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

    {/* Home button pill */}
    <Rect x="108" y="175" width="24" height="8" rx="4" fill="rgba(255,255,255,0.35)" />
  </Svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Slide data
// ─────────────────────────────────────────────────────────────────────────────

type SlideData = {
  id: string;
  title: string;
  subtitle: string;
  gradientColors: [string, string];
  Illustration: React.FC;
};

const slides: SlideData[] = [
  {
    id: '1',
    title: 'Your Health,\nSimplified',
    subtitle:
      'Instant health assessments from the comfort of your home — fast, accurate, and always available.',
    gradientColors: ['#0AADA2', '#078F8A'],
    Illustration: HealthIllustration,
  },
  {
    id: '2',
    title: 'AI-Powered\nDiagnosis',
    subtitle:
      'Advanced AI analyzes your symptoms and generates clinical insights with remarkable precision.',
    gradientColors: ['#067A76', '#054F4D'],
    Illustration: AIIllustration,
  },
  {
    id: '3',
    title: 'Expert Physicians\nOn Demand',
    subtitle:
      'Certified medical professionals review every AI assessment and deliver real-time diagnoses.',
    gradientColors: ['#044D4C', '#032C2C'],
    Illustration: PhysicianIllustration,
  },
  {
    id: '4',
    title: 'Track Your\nWellness Journey',
    subtitle:
      'Monitor health history, prescriptions, and follow-ups — everything in one beautiful place.',
    gradientColors: ['#032C2C', '#011818'],
    Illustration: WellnessIllustration,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Animated dot indicator
// ─────────────────────────────────────────────────────────────────────────────

type DotProps = { index: number; scrollX: Animated.Value };

const Dot: React.FC<DotProps> = ({ index, scrollX }) => {
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const dotWidth = scrollX.interpolate({
    inputRange,
    outputRange: [8, 22, 8],
    extrapolate: 'clamp',
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.35, 1, 0.35],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={{
        width: dotWidth,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'white',
        opacity,
        marginHorizontal: 4,
      }}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Slide item
// ─────────────────────────────────────────────────────────────────────────────

type SlideItemProps = { item: SlideData; bottomPad: number };

const SlideItem: React.FC<SlideItemProps> = ({ item, bottomPad }) => (
  <LinearGradient
    colors={item.gradientColors}
    start={{ x: 0.15, y: 0 }}
    end={{ x: 0.85, y: 1 }}
    style={{ width, flex: 1 }}
  >
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 36,
        paddingBottom: bottomPad,
      }}
    >
      {/* Illustration */}
      <View style={{ marginBottom: 36 }}>
        <item.Illustration />
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 34,
          fontWeight: '800',
          color: 'white',
          textAlign: 'center',
          lineHeight: 42,
          letterSpacing: -0.6,
          marginBottom: 14,
        }}
      >
        {item.title}
      </Text>

      {/* Subtitle */}
      <Text
        style={{
          fontSize: 16,
          color: 'rgba(255,255,255,0.72)',
          textAlign: 'center',
          lineHeight: 25,
          maxWidth: 310,
        }}
      >
        {item.subtitle}
      </Text>
    </View>
  </LinearGradient>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLast = currentIndex === slides.length - 1;

  // Height of bottom controls area so slides can pad themselves accordingly
  const CONTROLS_HEIGHT = 144 + insets.bottom;

  const completeIntro = useCallback(async () => {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
    router.replace('/welcome');
  }, []);

  const goNext = useCallback(() => {
    if (isLast) {
      completeIntro();
    } else {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex, isLast, completeIntro]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index!);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const renderSlide = useCallback(
    ({ item }: { item: SlideData }) => (
      <SlideItem item={item} bottomPad={CONTROLS_HEIGHT} />
    ),
    [CONTROLS_HEIGHT],
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#011818' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen slide carousel ── */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={{ flex: 1 }}
      />

      {/* ── Skip button – top right ── */}
      {!isLast && (
        <Pressable
          onPress={completeIntro}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          style={{
            position: 'absolute',
            top: insets.top + 14,
            right: 24,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
            Skip
          </Text>
        </Pressable>
      )}

      {/* ── Slide counter – top left ── */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 18,
          left: 24,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' }}>
          {currentIndex + 1} / {slides.length}
        </Text>
      </View>

      {/* ── Bottom controls overlay ── */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 28,
          paddingBottom: insets.bottom + 28,
          paddingTop: 20,
        }}
      >
        {/* Dot indicators */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 28,
          }}
        >
          {slides.map((_, i) => (
            <Dot key={i} index={i} scrollX={scrollX} />
          ))}
        </View>

        {/* CTA row */}
        {isLast ? (
          <>
            {/* Full-width Get Started */}
            <Pressable
              onPress={completeIntro}
              accessibilityRole="button"
              accessibilityLabel="Get started"
              style={({ pressed }) => ({
                backgroundColor: 'white',
                borderRadius: 18,
                paddingVertical: 17,
                alignItems: 'center',
                opacity: pressed ? 0.88 : 1,
                marginBottom: 14,
              })}
            >
              <Text
                style={{ color: '#0AADA2', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 }}
              >
                Get Started
              </Text>
            </Pressable>

            {/* Sign-in link */}
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              accessibilityRole="link"
              accessibilityLabel="Sign in to your account"
              style={{ alignItems: 'center', paddingVertical: 4 }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
                Already have an account?{' '}
                <Text style={{ color: 'rgba(255,255,255,0.90)', fontWeight: '700' }}>
                  Sign In
                </Text>
              </Text>
            </Pressable>
          </>
        ) : (
          /* Skip left  ──  Next right */
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable
              onPress={completeIntro}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Skip intro"
            >
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' }}>
                Skip
              </Text>
            </Pressable>

            <Pressable
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel="Next slide"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'white',
                borderRadius: 50,
                paddingVertical: 14,
                paddingHorizontal: 26,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#0AADA2', fontSize: 15, fontWeight: '800' }}>Next</Text>
              <Ionicons name="arrow-forward" size={16} color="#0AADA2" />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
