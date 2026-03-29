import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from 'stores/auth/auth-store';

const MDCN_URL = 'https://www.portal.mdcn.gov.ng/confirm-doctor-status';

export default function MdcnVerifyScreen() {
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const markMdcnVerified = useAuthStore((s) => s.markMdcnVerified);
  const user = useAuthStore((s) => s.user);

  // If already verified, skip straight to dashboard
  useEffect(() => {
    if (user?.mdcn_verified) {
      router.replace('/(prof-tab)/consultation');
    }
  }, [user?.mdcn_verified]);

  const handleConfirmAndProceed = async () => {
    setConfirming(true);
    await markMdcnVerified();
    setConfirming(false);
    setConfirmed(true);
    // Brief success flash then navigate
    setTimeout(() => router.replace('/(prof-tab)/consultation'), 1200);
  };

  const handleSkip = () => {
    router.replace('/(prof-tab)/consultation');
  };

  // ── Web platform fallback ─────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <LinearGradient colors={['#f0fdfa', '#ffffff']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(99,210,194,0.25)',
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#99f6e4',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#134e4a' }}>
                MDCN License Verification
              </Text>
              <Text style={{ fontSize: 12, color: '#0f766e', marginTop: 2 }}>
                Medical and Dental Council of Nigeria
              </Text>
            </View>
          </View>

          {/* Confirmed success state */}
          {confirmed ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: '#f0fdfa', borderWidth: 2, borderColor: '#22c55e',
                alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              }}>
                <Ionicons name="checkmark-circle" size={40} color="#16a34a" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#134e4a', textAlign: 'center' }}>
                Verification Confirmed
              </Text>
              <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 8 }}>
                Redirecting to your dashboard…
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: '#f0fdfa', borderWidth: 2, borderColor: '#5eead4',
                alignItems: 'center', justifyContent: 'center', marginBottom: 24,
              }}>
                <Ionicons name="open-outline" size={32} color="#0f766e" />
              </View>

              <Text style={{ fontSize: 18, fontWeight: '700', color: '#134e4a', textAlign: 'center', marginBottom: 12 }}>
                Verify Your Medical License
              </Text>
              <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
                Open the MDCN portal, confirm your doctor status, then return here and tap{' '}
                <Text style={{ fontWeight: '700', color: '#0f766e' }}>I've Verified</Text>.
              </Text>
              <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 28 }}>
                {MDCN_URL}
              </Text>

              <TouchableOpacity
                onPress={() => { if (typeof window !== 'undefined') window.open(MDCN_URL, '_blank'); }}
                style={{
                  borderWidth: 1.5, borderColor: '#0f766e', borderRadius: 12,
                  paddingVertical: 14, paddingHorizontal: 32, width: '100%',
                  alignItems: 'center', marginBottom: 12,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0f766e', fontWeight: '600', fontSize: 15 }}>
                  Open MDCN Portal ↗
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmAndProceed}
                disabled={confirming}
                style={{
                  backgroundColor: confirming ? '#99f6e4' : '#0f766e',
                  borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
                  width: '100%', alignItems: 'center', marginBottom: 12,
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
                activeOpacity={0.8}
              >
                {confirming
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {confirming ? 'Saving…' : "I've Verified on MDCN"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSkip} style={{ paddingVertical: 8 }}>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>Skip for now</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16, lineHeight: 17 }}>
                Your account is pending verification. Full access is granted once your license is confirmed via the MDCN portal.
              </Text>
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Native (iOS / Android) — embedded WebView ─────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0fdfa' }}>
      {/* Header */}
      <LinearGradient
        colors={['#0f766e', '#0d9488']}
        style={{
          paddingHorizontal: 16, paddingVertical: 14,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}
      >
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
            MDCN License Verification
          </Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
            Medical and Dental Council of Nigeria
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleSkip}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 6,
          }}
          activeOpacity={0.7}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Skip</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Info banner */}
      <View style={{
        backgroundColor: '#fffbeb', borderBottomWidth: 1, borderBottomColor: '#fde68a',
        paddingHorizontal: 16, paddingVertical: 10,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        <Ionicons name="information-circle-outline" size={16} color="#b45309" />
        <Text style={{ fontSize: 12, color: '#92400e', flex: 1, lineHeight: 17 }}>
          Search your name or license number on the MDCN portal, then tap <Text style={{ fontWeight: '700' }}>I've Verified</Text> below.
        </Text>
      </View>

      {/* Success overlay */}
      {confirmed && (
        <View style={{
          position: 'absolute', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(240,253,250,0.97)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#134e4a', marginTop: 16 }}>
            Verification Confirmed
          </Text>
          <Text style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>
            Redirecting to your dashboard…
          </Text>
        </View>
      )}

      {/* WebView loading indicator */}
      {webLoading && !confirmed && (
        <View style={{
          position: 'absolute', top: 160, left: 0, right: 0,
          alignItems: 'center', zIndex: 10,
        }}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={{ marginTop: 10, color: '#0f766e', fontSize: 13 }}>
            Loading MDCN portal…
          </Text>
        </View>
      )}

      {/* Error state */}
      {webError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Ionicons name="wifi-outline" size={48} color="#94a3b8" />
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#334155', marginTop: 16, textAlign: 'center' }}>
            Unable to load portal
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
            Check your connection and try again, or confirm verification below.
          </Text>
          <TouchableOpacity
            onPress={() => setWebError(false)}
            style={{
              marginTop: 20, backgroundColor: '#0f766e',
              borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          source={{ uri: MDCN_URL }}
          style={{ flex: 1 }}
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => setWebLoading(false)}
          onError={() => { setWebLoading(false); setWebError(true); }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
        />
      )}

      {/* Bottom action bar */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: 'rgba(99,210,194,0.25)',
        backgroundColor: '#fff', gap: 8,
      }}>
        <TouchableOpacity
          onPress={handleConfirmAndProceed}
          disabled={confirming || confirmed}
          style={{
            backgroundColor: confirming ? '#99f6e4' : '#0f766e',
            borderRadius: 12, paddingVertical: 14, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
          }}
          activeOpacity={0.8}
        >
          {confirming
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {confirming ? 'Saving…' : "I've Verified on MDCN"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: '#94a3b8', fontSize: 13 }}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

