import { Audio } from 'expo-av';

// Short 880Hz chirp (~120ms) encoded as WAV to avoid shipping extra binary assets.
const IM_TONE_URI =
  'data:audio/wav;base64,UklGRiQPAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAPAAAAABEAQQCEAMkA/AANAe0AlgAOAGL/p/76/Xf9Of1U/dD9p/7H/w8BWQJ5A0IElARXBIkDNgKCAJz+vvwm+wz6nfny+Qz70/wZ/50BEgQpBpsHMgjPB3MGPQRoAUf+OPub+Mj2AfZo9v33m/r6/bgBZQWNCMgKywtpC6MJpAa/Amb+Gvph9rTzbvLA8q30Bfhs/F8BTQabCsANVA8cDxENZwmEBPn+afmA9Nvw8O4G7yTxGPVx+pIAxQZMDHkQwxLbErIQfgy0BgAAKfkA80XukutD623t2vEN+FH/zAabDekSDhaeFn4U4Q9LCXsBXfnl8f3rX+iD55DpU+5G9Z39XQaADggVKBlYGmkYiRNBDGgDBvo38QnqYOXR45nljeoh8nf7eAX3Ds4WCRz/HWkcbBeTD8UFJ/v58HPon+I44JLhuObb7gb5AgSGDlMXXh3vH7oe4xn8EfUH/vxh8mDpDOMl4ALhieUy7RP3AgK1DOcVghy/HzofBBucE+MJ//459Nfq9uNm4JLgduSb6yr1AADWCmUUihtuH5ofChwpFccLAQEd9mTs/OTG4EHgfuMZ6kvz/v3tCM4Sdxr+Htsf9BygFp8NAgML+ATuHeZG4RHgouKt6Hrx/vv6BiURSBluHvsfwB0AGGoPAQUC+rfvWefl4QHg5eFZ57fvAvoBBWoPABjAHfsfbh5IGSUR+gb++3rxreii4hHgRuEd5gTuC/gCA58NoBb0HNsf/h53Gs4S7Qj+/UvzGep+40HgxuD85GTsHfYBAccLKRUKHJofbh+KG2UU1goAACr1m+t25JLgZuD249fqOfT//uMJnBMEGzofvx+CHOcVtQwCAhP3Mu2J5QLhJeAM42DpYfL+/PUH/BHjGboe7x9eHVMXhg4CBAb52+645pLhBeBA4gDolvD/+v4FSRCnGBse/x8bHqcYSRD+Bf/6lvAA6EDiBeCS4bjm2+4G+QIEhg5TF14d7x+6HuMZ/BH1B/78YfJg6QzjJeAC4YnlMu0T9wICtQznFYIcvx86HwQbnBPjCf/+OfTX6vbjZuCS4Hbkm+sq9QAAzgpEFEgbCh8cH4MbshR8C/oAbPYQ7f/lC+Kl4dTkMev48xv+ZQiiEboY3ByRHcga2xSEDMECvvil74voQORC46rlJ+sQ83H8LAYcDzMWoBriG9gZxxRLDU0E3vob8gvrgeYB5bHmWutp8gX7JQS3DLoTXBgWGroYdhTSDZsFy/xt9H3tyeja5ubnx+sC8tb5UwJ5ClIRExYxGHAX7hMbDqoGgv6X9tnvEOvK6ETpauzY8eX4uABkCAIPzRM4FgAWMRMmDnwHAACV+BvyU+3J6sTqQO3r8TP4V/99Bs8MjxEzFG8UQxL2DQ8IRAFl+j/0i+/T7GTsRe438r73MP7GBLwKXg8mEsMSKRGODWYITgID/ED2s/Hi7h3udO+68ob3RP1CA84IQA0WEP8Q5g/xDIAIHANs/Rr4x/Px8OnvyfBw84n3lPz0AQkHOQsKDisPfw4iDF8IrgOe/sn5wPX58sTxQPJX9Mb3IPzdAHAFTwkHDEsN+gwlCwcIBASZ/0r7m/f29Kjz0vNq9Tr45/sAAAcEhQcSCmQLWwv9CXgHHwRZAJr8Uvni9o/1fPWm9uL46ftd/9EC4AUwCH0JqAmvCLcGAATgALf94/q5+HX3OPcF+Lz5Jfzz/s8BZARmBpsH5QdAB8YFqQMsAZ7+Sfx0+lL5AfmD+cP6l/zE/gQBFQO5BMMFGAa0BakEGwM+AU3/gf0R/CP70Pob+/X7P/3P/nEA9QEuA/sDRwQRBGQDWQIWAcP/iP6K/eL8ofzI/E39Gv4T/xcABwHJAUcCeAJbAvoBZgG2AAAAXP/b/or+bv6F/sb+JP+P//j/TwCNAKwArgCYAHIARgAeAAMA+f8=';

let configured = false;
let lastPlayedAt = 0;

async function ensureAudioMode(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Best effort: tone playback still attempts with default mode.
  }
}

export async function playIMArrivalTone(): Promise<void> {
  const now = Date.now();
  // Prevent overlapping chirps when several events arrive nearly together.
  if (now - lastPlayedAt < 350) return;
  lastPlayedAt = now;

  try {
    await ensureAudioMode();
    const { sound } = await Audio.Sound.createAsync(
      { uri: IM_TONE_URI },
      { shouldPlay: true, volume: 1.0 },
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      sound.unloadAsync().catch(() => {});
    });
  } catch {
    // Silent failure: tone is non-critical UX enhancement.
  }
}
