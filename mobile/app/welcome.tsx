import React from 'react';
import { View, Text, Pressable, StatusBar, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle, Path, Rect, Line, Text as SvgText,
} from 'react-native-svg';

const { width } = Dimensions.get('window');

// ── Illustration (matches intro slide 1) ──────────────────────────────────────
const HeroIllustration: React.FC = () => (
  <Svg width={260} height={220} viewBox="0 0 260 220">
    {/* Ambient rings */}
    <Circle cx="130" cy="110" r="100" fill="rgba(255,255,255,0.03)" />
    <Circle cx="130" cy="110" r="80"  fill="rgba(255,255,255,0.05)" />
    <Circle cx="130" cy="110" r="58"  fill="rgba(255,255,255,0.07)" />

    {/* Dashed orbit */}
    <Circle cx="130" cy="110" r="98"
      fill="none"
      stroke="rgba(255,255,255,0.13)"
      strokeWidth="1"
      strokeDasharray="5 7"
    />

    {/* Metric card: Heart Rate */}
    <Rect x="170" y="26" width="68" height="32" rx="9" fill="rgba(255,255,255,0.16)" />
    <Rect x="170" y="26" width="68" height="32" rx="9" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
    <SvgText fill="white" fontSize="8" fontWeight="700" x="178" y="39" opacity="0.6">HEART RATE</SvgText>
    <SvgText fill="white" fontSize="13" fontWeight="800" x="178" y="51">72 bpm</SvgText>

    {/* Metric card: SpO₂ */}
    <Rect x="18" y="152" width="62" height="32" rx="9" fill="rgba(255,255,255,0.16)" />
    <Rect x="18" y="152" width="62" height="32" rx="9" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
    <SvgText fill="white" fontSize="8" fontWeight="700" x="26" y="165" opacity="0.6">SPO₂</SvgText>
    <SvgText fill="white" fontSize="13" fontWeight="800" x="26" y="177">98%</SvgText>

    {/* Metric card: Temp */}
    <Rect x="14" y="36" width="60" height="32" rx="9" fill="rgba(255,255,255,0.16)" />
    <Rect x="14" y="36" width="60" height="32" rx="9" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1" />
    <SvgText fill="white" fontSize="8" fontWeight="700" x="22" y="49" opacity="0.6">TEMP</SvgText>
    <SvgText fill="white" fontSize="13" fontWeight="800" x="22" y="61">36.6 °C</SvgText>

    {/* Heart shadow/glow */}
    <Path
      d="M130 172 C56 130 34 80 34 57 C34 29 58 12 84 12 C101 12 117 22 130 37 C143 22 159 12 176 12 C202 12 226 29 226 57 C226 80 204 130 130 172Z"
      fill="rgba(255,255,255,0.10)" transform="translate(0,5)"
    />
    {/* Heart */}
    <Path
      d="M130 170 C56 128 34 78 34 55 C34 27 58 10 84 10 C101 10 117 20 130 35 C143 20 159 10 176 10 C202 10 226 27 226 55 C226 78 204 128 130 170Z"
      fill="white"
      opacity="0.92"
    />

    {/* ECG line */}
    <Path
      d="M58 92 L80 92 L90 66 L101 118 L111 82 L121 92 L152 92 L162 70 L173 112 L183 92 L202 92"
      stroke="#0AADA2"
      strokeWidth="3.8"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Live dot */}
    <Circle cx="202" cy="92" r="4"  fill="#0AADA2" />
    <Circle cx="202" cy="92" r="8"  fill="#0AADA2" opacity="0.28" />
    <Circle cx="202" cy="92" r="13" fill="#0AADA2" opacity="0.10" />

    {/* Connector dashes */}
    <Line x1="170" y1="42"  x2="222" y2="62"  stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeDasharray="3 4" />
    <Line x1="72"  y1="168" x2="44"  y2="184" stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeDasharray="3 4" />
  </Svg>
);

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#0D2137' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <LinearGradient
        colors={['#0D2137', '#0A5C58']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* Ambient orbs */}
        <View style={{
          position: 'absolute', top: -90, right: -70,
          width: 300, height: 300, borderRadius: 150,
          backgroundColor: 'rgba(10,173,162,0.15)',
        }} />
        <View style={{
          position: 'absolute', bottom: 80, left: -90,
          width: 260, height: 260, borderRadius: 130,
          backgroundColor: 'rgba(10,173,162,0.09)',
        }} />

        <View style={{
          flex: 1,
          alignItems: 'center',
          paddingTop: insets.top + 36,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 28,
        }}>

          {/* ── Branded badge ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: 'rgba(10,173,162,0.20)',
            borderWidth: 1, borderColor: 'rgba(10,173,162,0.42)',
            borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
            marginBottom: 32,
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#0AADA2' }} />
            <Text style={{
              fontSize: 12, fontWeight: '700',
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: 1.5, textTransform: 'uppercase',
            }}>
              LifeGate Health + LifeFund
            </Text>
          </View>

          {/* ── Hero illustration ── */}
          <HeroIllustration />

          {/* ── Headline ── */}
          <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 14 }}>
            <Text style={{
              fontSize: 13, fontWeight: '700', color: '#0AADA2',
              letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10,
            }}>
              Welcome
            </Text>
            <Text style={{
              fontSize: 36, fontWeight: '900', color: 'white',
              textAlign: 'center', lineHeight: 44, letterSpacing: -0.8,
            }}>
              Care today.{'\n'}
              <Text style={{ color: 'rgba(255,255,255,0.60)' }}>Support for tomorrow.</Text>
            </Text>
            {/* Teal accent underline */}
            <View style={{
              marginTop: 14, width: 44, height: 3,
              backgroundColor: '#0AADA2', borderRadius: 2,
            }} />
          </View>

          {/* ── Subtitle ── */}
          <Text style={{
            fontSize: 15, color: 'rgba(255,255,255,0.58)',
            textAlign: 'center', lineHeight: 24, maxWidth: 300,
            marginBottom: 36,
          }}>
            Understand your health, connect with care, and access transparent healthcare financing when an eligible bill cannot wait.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginBottom: 28 }}>
            <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}>
              <Ionicons name="pulse-outline" size={18} color="#5eead4" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 7 }}>Care guidance</Text>
              <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, lineHeight: 14, marginTop: 2 }}>Health checks and clinician support.</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}>
              <Ionicons name="wallet-outline" size={18} color="#5eead4" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 7 }}>LifeFund support</Text>
              <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, lineHeight: 14, marginTop: 2 }}>Eligible users can request bill financing.</Text>
            </View>
          </View>

          <View style={{ width: '100%', gap: 12, marginTop: 'auto' }}>
            {/* Primary CTA */}
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: 'white',
                borderRadius: 18,
                paddingVertical: 17,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Ionicons name="heart-outline" size={18} color="#0AADA2" />
              <Text style={{ color: '#0AADA2', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 }}>
                Get started with LifeGate
              </Text>
            </Pressable>

            {/* Secondary CTA */}
            <Pressable
              onPress={() => router.replace('/(prof-tab)/review')}
              accessibilityRole="button"
              style={({ pressed }) => ({
                borderRadius: 18,
                paddingVertical: 16,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                opacity: pressed ? 0.80 : 1,
              })}
            >
              <Ionicons name="medkit-outline" size={17} color="rgba(255,255,255,0.80)" />
              <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 15, fontWeight: '700' }}>
                For Physicians
              </Text>
            </Pressable>

            {/* Copyright */}
            <Text style={{
              marginTop: 10, textAlign: 'center',
              fontSize: 11, color: 'rgba(255,255,255,0.28)',
            }}>
              © {new Date().getFullYear()} LifeGate by DSHub. All rights reserved.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
