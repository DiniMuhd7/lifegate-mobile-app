/**
 * useRingtone
 *
 * Plays a looping ringtone while `ringing` is true and stops it as soon as
 * it becomes false (call answered, ended, rejected, etc.).
 *
 * Platform strategy:
 *  - Web: creates an <audio> element **muted** on mount and starts it looping.
 *    Muted autoplay is always permitted by browsers (no gesture required).
 *    We then unmute the element when `ringing` is true and mute it again when
 *    false.  This sidesteps Chrome/Safari's autoplay-with-sound restriction
 *    which would block play() when called from a useEffect (outside the
 *    original gesture context).
 *  - Native (iOS/Android): uses expo-av with playsInSilentModeIOS so the
 *    ringer is audible even when the silent switch is on.
 */
import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RINGTONE_ASSET = require('../assets/ringtone.wav');

export function useRingtone(ringing: boolean) {
  const soundRef    = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);

  // ── Web: initialise muted audio element once on mount ──────────────────────
  // Muted autoplay is universally allowed (no gesture window needed).  We keep
  // the element playing silently at all times and simply toggle `.muted` to
  // produce or suppress sound.
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const W = globalThis as any;
    if (typeof W.Audio === 'undefined') return;

    const audio = new W.Audio('/ringtone.wav') as HTMLAudioElement;
    audio.loop   = true;
    audio.volume = 1.0;
    audio.muted  = true; // start silent so autoplay is always allowed
    webAudioRef.current = audio;

    // Start the element immediately (muted = allowed everywhere).
    audio.play().catch(() => {
      // Some headless/test environments have no audio stack – ignore.
    });

    return () => {
      audio.pause();
      audio.src = '';
      webAudioRef.current = null;
    };
  }, []); // run once on mount

  // ── Web: toggle mute based on ringing state ────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const audio = webAudioRef.current;
    if (!audio) return;

    if (ringing) {
      audio.currentTime = 0;
      audio.muted = false; // browser allows unmuting an already-playing element
    } else {
      audio.muted = true;
    }
  }, [ringing]);

  // ── Web: keep the rest of the hook from touching native paths ─────────────
  useEffect(() => {
    if (Platform.OS === 'web') return; // handled above

    let cancelled = false;

    // ── Native ────────────────────────────────────────────────────────────────
    async function play() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playThroughEarpieceAndroid: false,
        });

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
        if (!cancelled) console.warn('[useRingtone] native play error:', err);
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

