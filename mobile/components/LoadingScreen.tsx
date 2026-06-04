/**
 * LoadingScreen
 *
 * Full-screen overlay shown while session / page content is being prepared.
 * Replaces the bare blank View used in layout guards so users always know
 * something is happening.
 */
import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

type Props = {
  /** Background color — matches the section's brand color. Defaults to teal. */
  backgroundColor?: string;
  /** Spinner and text tint. Defaults to white. */
  tintColor?: string;
  /** Optional status message. */
  message?: string;
};

export function LoadingScreen({
  backgroundColor = '#032C2C',
  tintColor = '#ffffff',
  message = 'Loading your session…',
}: Props) {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ActivityIndicator size="large" color={tintColor} />
      <Text style={[styles.message, { color: tintColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  message: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: 'center',
  },
});
