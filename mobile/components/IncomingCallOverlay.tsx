/**
 * IncomingCallOverlay
 *
 * Full-screen overlay that appears when another user is calling.
 * Shows caller info, call type, and Accept / Decline buttons.
 * Auto-dismisses after 30 s (missed call).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallStore } from '../stores/call-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

const AVATAR_COLORS = ['#128c7e', '#1a73e8', '#8e44ad', '#c0392b', '#e67e22'];
function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IncomingCallOverlay() {
  const insets = useSafeAreaInsets();

  const incomingCall       = useCallStore((s) => s.incomingCall);
  const acceptIncomingCall = useCallStore((s) => s.acceptIncomingCall);
  const rejectIncomingCall = useCallStore((s) => s.rejectIncomingCall);

  // Slide in from top
  const translateY = useRef(new Animated.Value(-500)).current;
  // Pulsing ring for the avatar
  const ringScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;
  const autoRejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!incomingCall) {
      // Slide out
      Animated.timing(translateY, {
        toValue: -500,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      ringScale.setValue(1);
      ringOpacity.setValue(0.5);
      if (autoRejectTimer.current) clearTimeout(autoRejectTimer.current);
      return;
    }

    // Slide in
    Animated.spring(translateY, {
      toValue: 0,
      tension: 70,
      friction: 10,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    // Pulsing ring animation
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.7, duration: 1000, useNativeDriver: Platform.OS !== 'web', easing: Easing.out(Easing.ease) }),
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(ringOpacity, { toValue: 0.5, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ]),
    );
    loop.start();

    // Auto-reject after 30 s (missed call)
    autoRejectTimer.current = setTimeout(async () => {
      await rejectIncomingCall();
    }, 30_000);

    return () => {
      loop.stop();
      if (autoRejectTimer.current) clearTimeout(autoRejectTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall?.callId]);

  const handleAccept = useCallback(() => {
    if (autoRejectTimer.current) clearTimeout(autoRejectTimer.current);
    acceptIncomingCall();
  }, [acceptIncomingCall]);

  const handleDecline = useCallback(async () => {
    if (autoRejectTimer.current) clearTimeout(autoRejectTimer.current);
    await rejectIncomingCall();
  }, [rejectIncomingCall]);

  if (!incomingCall) return null;

  const { callerName, callType } = incomingCall;
  const initials = getInitials(callerName);
  const bgColor  = avatarColor(callerName);
  const isVideo  = callType === 'video';

  return (
    <Animated.View
      style={[
        styles.overlay,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        { transform: [{ translateY }] },
      ]}
    >
      {/* Call type label */}
      <View style={styles.callTypeRow}>
        <Ionicons
          name={isVideo ? 'videocam' : 'call'}
          size={14}
          color="rgba(255,255,255,0.8)"
        />
        <Text style={styles.callTypeText}>
          {isVideo ? 'Incoming video call' : 'Incoming voice call'}
        </Text>
      </View>

      {/* Avatar with pulsing ring */}
      <View style={styles.avatarContainer}>
        <Animated.View
          style={[
            styles.ring,
            { backgroundColor: bgColor, transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>

      {/* Caller name */}
      <Text style={styles.callerName} numberOfLines={2}>{callerName}</Text>
      <Text style={styles.callerSubtitle}>LifeGate</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        {/* Decline */}
        <View style={styles.actionItem}>
          <Pressable onPress={handleDecline} style={[styles.actionBtn, styles.declineBtn]} accessibilityLabel="Decline call">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Text style={styles.actionLabel}>Decline</Text>
        </View>

        {/* Accept */}
        <View style={styles.actionItem}>
          <Pressable onPress={handleAccept} style={[styles.actionBtn, styles.acceptBtn]} accessibilityLabel="Accept call">
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={28} color="#fff" />
          </Pressable>
          <Text style={styles.actionLabel}>Accept</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 32,
  },
  callTypeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  ring: {
    position: 'absolute',
    width: 136,
    height: 136,
    borderRadius: 68,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  callerName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 40,
    letterSpacing: -0.3,
  },
  callerSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 80,
    marginTop: 56,
  },
  actionItem: {
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  declineBtn: {
    backgroundColor: '#ff3b30',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#34c759',
    shadowColor: '#34c759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
});
