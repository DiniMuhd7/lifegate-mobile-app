/**
 * SessionErrorScreen
 *
 * Shown in layout guards when the session-restore call fails
 * (e.g. network unavailable at startup).
 * Provides a branded, actionable recovery UI instead of a frozen blank screen.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  /** Background color — matches the section's brand color. Defaults to teal. */
  backgroundColor?: string;
  /** When true, uses dark text (for light backgrounds like white/slate). */
  darkText?: boolean;
  /** Optional override message. */
  message?: string;
  /** Called when "Try Again" is pressed. */
  onRetry: () => void;
};

export function SessionErrorScreen({
  backgroundColor = '#032C2C',
  darkText = false,
  message = 'We couldn\'t load your session.\nPlease check your connection and try again.',
  onRetry,
}: Props) {
  const titleColor = darkText ? '#1e293b' : '#ffffff';
  const subtitleColor = darkText ? '#64748b' : 'rgba(255,255,255,0.65)';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, darkText && { backgroundColor: '#fee2e2' }]}>
          <Ionicons name="cloud-offline-outline" size={52} color="#f87171" />
        </View>

        <Text style={[styles.title, { color: titleColor }]}>Connection Error</Text>
        <Text style={[styles.subtitle, { color: subtitleColor }]}>{message}</Text>

        <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(248,113,113,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0AADA2',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
