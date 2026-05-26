/**
 * Physician Registration – Verification Pending Screen
 *
 * Shown immediately after a physician successfully verifies their sign-up OTP.
 * Informs them that their credentials are under review and they will be
 * notified within 24 hours. Replaces the MDCN live-verification step which
 * will be re-enabled in a future release.
 *
 * Lives outside the (auth) group so the auth-layout auto-redirect cannot
 * intercept it before the physician reads the message.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Platform,
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LogoImage from 'assets/lifegate-logo.png';
import { useAuthStore } from 'stores/auth-store';

// ─────────────────────────────────────────────────────────────────────────────
// Checklist items — what LifeGate verifies before activation
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_ITEMS: { icon: string; label: string; sublabel: string }[] = [
  {
    icon: 'person-circle-outline',
    label: 'Identity & Contact Details',
    sublabel: 'Full name, email and phone number',
  },
  {
    icon: 'document-text-outline',
    label: 'Medical Certification',
    sublabel: 'Uploaded certificate number and issue date',
  },
  {
    icon: 'shield-checkmark-outline',
    label: 'MDCN Licence Status',
    sublabel: 'Cross-checked with MDCN public registry',
  },
  {
    icon: 'medal-outline',
    label: 'Specialty & Experience',
    sublabel: 'Specialization credentials verified',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing ring animation component
// ─────────────────────────────────────────────────────────────────────────────

const PulseRing: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.55,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function PhysicianPendingScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, restoreSession, logout, user } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  // If the physician's account becomes verified (e.g. admin approves while app
  // is open), auto-redirect them without needing to tap anything. Also guard
  // against unauthenticated or wrong-role users landing on this screen.
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    if (user?.role !== 'professional') {
      if (user?.role === 'admin') {
        router.replace('/(admin-tab)/dashboard');
      } else {
        router.replace('/(tab)/health');
      }
      return;
    }
    if (user?.mdcn_verified) {
      router.replace('/(prof-tab)/review');
    }
  }, [isAuthenticated, user]);

  const handleCheckStatus = async () => {
    setChecking(true);
    setCheckMsg(null);
    await restoreSession();
    const refreshed = useAuthStore.getState().user;
    if (refreshed?.mdcn_verified) {
      // Redirect handled by the useEffect above
    } else {
      setCheckMsg('Verification still in progress. We\'ll notify you by email once it\'s complete.');
    }
    setChecking(false);
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/(auth)/login');
  };
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#032C2C' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-bleed gradient header  ──────────────────────────────────── */}
      <LinearGradient
        colors={['#0AADA2', '#067A76', '#043B3C']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          paddingTop: (insets.top || 0) + (Platform.OS === 'android' ? 28 : 16),
          paddingBottom: 48,
          alignItems: 'center',
        }}
      >
        {/* Brand logo – top left */}
        <View style={{ position: 'absolute', top: (insets.top || 0) + 16, left: 22 }}>
          <Image source={LogoImage} style={{ width: 32, height: 32 }} resizeMode="contain" />
        </View>

        {/* Animated icon cluster */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 22 }}>
          {/* Pulse rings */}
          <PulseRing delay={0} />
          <PulseRing delay={700} />

          {/* Central circle */}
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="hourglass-outline" size={32} color="#0AADA2" />
            </View>
          </View>
        </View>

        {/* Headline */}
        <Text
          style={{
            fontSize: 26,
            fontWeight: '800',
            color: 'white',
            letterSpacing: -0.4,
            textAlign: 'center',
            paddingHorizontal: 24,
          }}
        >
          Application Submitted!
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.72)',
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 40,
            lineHeight: 21,
          }}
        >
          Your profile is currently under review by the LifeGate compliance team.
        </Text>

        {/* 24 hr badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 18,
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 50,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.25)',
          }}
        >
          <Ionicons name="time-outline" size={15} color="white" />
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>
            Typically verified within 24 hours
          </Text>
        </View>
      </LinearGradient>

      {/* ── Scrollable body card ──────────────────────────────────────────── */}
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          marginTop: -24,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          backgroundColor: '#F7FEFD',
          overflow: 'hidden',
        }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 28,
            paddingBottom: (insets.bottom || 20) + 28,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── What we're verifying ────────────────────────────────────── */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: 0.9,
              marginBottom: 14,
            }}
          >
            What we're reviewing
          </Text>

          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2f0ef',
              overflow: 'hidden',
              marginBottom: 22,
            }}
          >
            {CHECK_ITEMS.map((item, index) => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  borderBottomWidth: index < CHECK_ITEMS.length - 1 ? 1 : 0,
                  borderBottomColor: '#f1f5f9',
                }}
              >
                {/* Left icon */}
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: '#e8f9f8',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                    flexShrink: 0,
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="#0AADA2" />
                </View>

                {/* Labels */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>
                    {item.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {item.sublabel}
                  </Text>
                </View>

                {/* Pending chip */}
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 50,
                    backgroundColor: '#fef9c3',
                    borderWidth: 1,
                    borderColor: '#fde68a',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#854d0e' }}>
                    Pending
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Notification info card ───────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              backgroundColor: '#eff8ff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#bae6fd',
              padding: 16,
              marginBottom: 22,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#dbeafe',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Ionicons name="mail-outline" size={18} color="#1d4ed8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a5f' }}>
                You'll be notified by email
              </Text>
              <Text style={{ fontSize: 12, color: '#3b5a8a', marginTop: 4, lineHeight: 18 }}>
                Once your credentials are verified, you'll receive a confirmation email with
                instructions to log in and begin reviewing patient cases.
              </Text>
            </View>
          </View>

          {/* ── What to expect next ─────────────────────────────────────── */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: 0.9,
              marginBottom: 14,
            }}
          >
            What happens next
          </Text>

          {[
            {
              step: '1',
              title: 'Compliance review',
              body: 'The LifeGate team verifies your medical credentials against official records.',
              color: '#0AADA2',
            },
            {
              step: '2',
              title: 'Account activation',
              body: 'Your physician account is activated and you\'re granted access to the case queue.',
              color: '#0891b2',
            },
            {
              step: '3',
              title: 'Email confirmation',
              body: 'A confirmation email is sent to your registered address — you can then log in.',
              color: '#7c3aed',
            },
          ].map((item, idx) => (
            <View
              key={item.step}
              style={{ flexDirection: 'row', marginBottom: idx < 2 ? 0 : 22, gap: 14 }}
            >
              {/* Step number + connector line */}
              <View style={{ alignItems: 'center', width: 32 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: item.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>
                    {item.step}
                  </Text>
                </View>
                {idx < 2 && (
                  <View
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 28,
                      backgroundColor: '#e2e8f0',
                      marginTop: 4,
                    }}
                  />
                )}
              </View>

              {/* Content */}
              <View style={{ flex: 1, paddingBottom: idx < 2 ? 20 : 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b', marginTop: 5 }}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 3, lineHeight: 19 }}>
                  {item.body}
                </Text>
              </View>
            </View>
          ))}

          {/* ── Support note ─────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 14,
              marginBottom: 22,
              gap: 10,
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color="#64748b" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, color: '#64748b', lineHeight: 18 }}>
              If you haven't received a notification after 24 hours, please contact{' '}
              <Text style={{ color: '#0AADA2', fontWeight: '600' }}>support@lifegate.ng</Text> with
              your registered email for assistance.
            </Text>
          </View>

          {/* ── Status feedback message ───────────────────────────────── */}
          {checkMsg && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                backgroundColor: '#fef9c3',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#fde68a',
                padding: 14,
                marginBottom: 18,
                gap: 10,
              }}
            >
              <Ionicons name="time-outline" size={18} color="#b45309" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#78350f', lineHeight: 19 }}>
                {checkMsg}
              </Text>
            </View>
          )}

          {/* ── CTAs ─────────────────────────────────────────────────────── */}
          {isAuthenticated ? (
            <>
              {/* Primary: Check verification status */}
              <Pressable
                onPress={handleCheckStatus}
                disabled={checking}
                accessibilityRole="button"
                accessibilityLabel="Check verification status"
                style={({ pressed }) => ({
                  backgroundColor: checking ? '#7db5b3' : pressed ? '#0891b2' : '#0AADA2',
                  borderRadius: 18,
                  paddingVertical: 17,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 14,
                })}
              >
                {checking ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Ionicons name="refresh-outline" size={20} color="white" />
                )}
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>
                  {checking ? 'Checking…' : 'Check Verification Status'}
                </Text>
              </Pressable>

              {/* Secondary: Sign out */}
              <Pressable
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                style={({ pressed }) => ({
                  borderRadius: 18,
                  paddingVertical: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                  borderWidth: 1.5,
                  borderColor: '#0AADA2',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="log-out-outline" size={20} color="#0AADA2" />
                <Text style={{ color: '#0AADA2', fontWeight: '700', fontSize: 16 }}>Sign Out</Text>
              </Pressable>
            </>
          ) : (
            /* Post-registration (not yet authenticated): back to login */
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              accessibilityRole="button"
              accessibilityLabel="Back to Login"
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#0891b2' : '#0AADA2',
                borderRadius: 18,
                paddingVertical: 17,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              <Ionicons name="log-in-outline" size={20} color="white" />
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Back to Login</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
