import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ProfessionalService } from '../services/professional-service';

// Configure how notifications look while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // We use the in-app banner instead
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

/**
 * Requests push permission, retrieves the Expo push token,
 * and registers it with the backend.
 *
 * Should be called once after the physician is authenticated.
 */
export async function registerPhysicianPushToken(): Promise<void> {
  if (!Device.isDevice) {
    // Push notifications only work on physical devices
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('physician-cases', {
      name: 'Case Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  await ProfessionalService.registerPushToken(tokenData.data);
}

/**
 * Returns a subscription that fires when the user taps a push notification.
 * The response handler receives the notification data and can navigate to a case.
 */
export function addNotificationResponseListener(
  handler: (caseId: string) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const caseId = data?.caseId as string | undefined;
    if (caseId) handler(caseId);
  });
}
