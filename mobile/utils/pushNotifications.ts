import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ProfessionalService } from '../services/professional-service';
import api from '../services/api';

export type InAppPushNotificationPayload = {
  type: 'new_case' | 'case_status' | 'im_message';
  caseId: string;
  diagnosisId?: string;
  message: string;
};

function normalizePushToInAppPayload(
  notification: Notifications.Notification
): InAppPushNotificationPayload | null {
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
  const caseId = String(data.caseId ?? data.diagnosisId ?? '').trim();
  if (!caseId) return null;

  const rawType = String(data.type ?? '').toLowerCase();
  const type: InAppPushNotificationPayload['type'] =
    rawType === 'im_message' || rawType === 'message'
      ? 'im_message'
      : rawType === 'new_case' || rawType === 'case'
        ? 'new_case'
        : 'case_status';

  const body = String(notification.request.content.body ?? '').trim();
  const fallback =
    type === 'im_message'
      ? 'You have a new message.'
      : type === 'new_case'
        ? 'You have a new case notification.'
        : 'Your case has been updated.';

  return {
    type,
    caseId,
    diagnosisId: String(data.diagnosisId ?? '').trim() || undefined,
    message: body || fallback,
  };
}

// Configure how notifications look while the app is in the foreground.
// expo-notifications does not support this API on web, so guard it.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Physician case push notifications use an in-app banner, so suppress the
      // OS banner for those. All other notifications (e.g. daily health insight)
      // should show the OS banner normally.
      const isCaseNotif = notification.request.content.data?.type === 'case';
      return {
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: !isCaseNotif,
        shouldShowList: true,
      };
    },
  });
}

/**
 * Requests push permission, retrieves the Expo push token,
 * and registers it with the backend.
 *
 * Should be called once after the physician is authenticated.
 */
export async function registerPhysicianPushToken(): Promise<void> {
  // Push notifications are not available on web or simulators
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return;

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

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await ProfessionalService.registerPushToken(tokenData.data);
}

const INSIGHT_NOTIF_ID_KEY = 'health_insight_notification_id';

/**
 * Schedules (or reschedules) a daily 8 AM notification containing the
 * patient's personalised health insight text.
 *
 * Called from the patient health screen whenever the derived insight changes.
 * Silently no-ops if notification permission has not been granted.
 */
export async function scheduleHealthInsightNotification(insightText: string): Promise<void> {
  // expo-notifications does not support local scheduling on web
  if (Platform.OS === 'web') return;

  try {
    // Request permission if not yet granted (e.g. first-time patient users)
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    // Ensure the Android notification channel exists
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('health-insights', {
        name: 'Daily Health Insights',
        importance: Notifications.AndroidImportance.DEFAULT,
        description: 'Your personalised daily health insight at 8 AM',
      });
    }

    // Cancel the previously scheduled insight notification (if any)
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const prevId = await AsyncStorage.getItem(INSIGHT_NOTIF_ID_KEY);
    if (prevId) {
      await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});
    }

    const notifContent: Notifications.NotificationContentInput = {
      title: '🌿 Your Daily Health Insight',
      body: insightText,
      sound: true,
      data: { type: 'health_insight' },
      ...(Platform.OS === 'android' && { channelId: 'health-insights' }),
    };

    // DEV ONLY: fire a preview notification 5 seconds after the health screen
    // loads so the schedule can be verified without waiting until 8 AM.
    if (__DEV__) {
      await Notifications.scheduleNotificationAsync({
        content: { ...notifContent, title: '[Preview] ' + notifContent.title },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });
    }

    // Schedule a new daily notification at 08:00
    const id = await Notifications.scheduleNotificationAsync({
      content: notifContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      },
    });

    await AsyncStorage.setItem(INSIGHT_NOTIF_ID_KEY, id);
  } catch (e) {
    // Non-fatal — never interrupt the UI for a notification scheduling failure
    console.warn('[HealthInsight] Failed to schedule daily notification:', e);
  }
}

/**
 * Requests push permission, retrieves the Expo push token,
 * and registers it with the backend for a patient user.
 *
 * Should be called once after the patient is authenticated.
 * The backend will also send a profile-completion reminder push if the
 * patient's health profile is not fully filled in.
 */
export async function registerPatientPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return;

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
    await Notifications.setNotificationChannelAsync('patient-updates', {
      name: 'Health & Case Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  // POST /push-token — patient-scoped endpoint
  await api.post('/push-token', { token: tokenData.data });
}

/**
 * Returns a subscription that fires when the user taps a push notification.
 * The response handler receives the notification data and can navigate to a case.
 * Returns a no-op subscription on web.
 */
export function addNotificationResponseListener(
  handler: (caseId: string) => void
): Notifications.EventSubscription {
  if (Platform.OS === 'web') {
    // Return a stub that matches the EventSubscription interface
    return { remove: () => {} } as Notifications.EventSubscription;
  }
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const caseId = (data?.caseId ?? data?.diagnosisId) as string | undefined;
    if (caseId) handler(caseId);
  });
}

/**
 * Returns a subscription that fires when a push notification is received while
 * the app is running (foreground). Payload is normalized for in-app store use.
 * Returns a no-op subscription on web.
 */
export function addNotificationReceivedListener(
  handler: (payload: InAppPushNotificationPayload) => void
): Notifications.EventSubscription {
  if (Platform.OS === 'web') {
    return { remove: () => {} } as Notifications.EventSubscription;
  }

  return Notifications.addNotificationReceivedListener((notification) => {
    const payload = normalizePushToInAppPayload(notification);
    if (payload) handler(payload);
  });
}
