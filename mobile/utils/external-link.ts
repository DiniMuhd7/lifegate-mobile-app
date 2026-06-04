import { Linking, Platform } from 'react-native';

export async function openExternalUrl(url: string): Promise<boolean> {
  const trimmed = url?.trim();
  if (!trimmed) return false;

  try {
    if (Platform.OS === 'web') {
      const win = (globalThis as { window?: Window }).window;
      if (win?.open) {
        const opened = win.open(trimmed, '_blank', 'noopener,noreferrer');
        if (opened) return true;
      }
    }

    const supported = await Linking.canOpenURL(trimmed);
    if (!supported) return false;
    await Linking.openURL(trimmed);
    return true;
  } catch {
    return false;
  }
}

export async function openFirstSupportedExternalUrl(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    if (await openExternalUrl(url)) return true;
  }
  return false;
}