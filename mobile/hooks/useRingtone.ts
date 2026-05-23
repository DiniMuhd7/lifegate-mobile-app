/**
 * useRingtone
 *
 * Plays a looping ringtone while `ringing` is true and stops it as soon as
 * it becomes false (call answered, ended, rejected, etc.).
 *
 * Uses expo-av on both native and web (HTML5 Audio internally on web).
 * On iOS the audio session is configured to play even in silent mode so the
 * caller hears the ring through the earpiece / speaker.
 */
import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RINGTONE_ASSET = require('../assets/ringtone.wav');

export function useRingtone(ringing: boolean) {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function play() {
      try {
        // Allow audio over the silent switch on iOS and keep playing in the bg
        if (Platform.OS !== 'web') {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            // Route through the speaker (earpiece + external) for visibility
            playThroughEarpieceAndroid: false,
          });
        }

        const { sound } = await Audio.Sound.createAsync(
          RINGTONE_ASSET,
          { isLooping: true, volume: 1.0 },
        );

        if (cancelled) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        await sound.playAsync();
      } catch (err) {
        if (!cancelled) console.warn('[useRingtone] play error:', err);
      }
    }

    async function stop() {
      const s = soundRef.current;
      soundRef.current = null;
      if (s) {
        try {
          await s.stopAsync();
          await s.unloadAsync();
        } catch {}
      }
    }

    if (ringing) {
      play();
    } else {
      stop();
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [ringing]);
}
