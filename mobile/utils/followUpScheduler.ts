/**
 * Follow-up scheduling utility.
 *
 * When EDIS includes a `followUpPlan` in its response the mobile client calls
 * `scheduleFollowUp()` to:
 *
 *  1. Request calendar and notification permissions.
 *  2. Add a calendar event on the follow-up date (readable offline).
 *  3. Schedule a local push notification that fires at 9 AM on the follow-up
 *     date asking the patient "Did your symptoms improve?".
 *
 * The generated local notification ID and calendar event ID are stored in
 * AsyncStorage so they can be cancelled if the case is resolved early.
 */

import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface FollowUpPlan {
  daysUntil: number;
  triggerSymptoms: string[];
}

export interface FollowUpScheduleResult {
  followUpDate: Date;
  calendarEventId: string | null;
  notificationId: string | null;
}

const STORAGE_KEY_PREFIX = 'followup:';

// ─── Permission helpers ───────────────────────────────────────────────────────

async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

async function getOrCreateLifeGateCalendarId(): Promise<string | null> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const existing = calendars.find((c) => c.title === 'LifeGate Health');
    if (existing) return existing.id;

    // On iOS the default calendar must be used as the source.
    const defaultCalendar =
      Platform.OS === 'ios'
        ? await Calendar.getDefaultCalendarAsync()
        : null;

    const newId = await Calendar.createCalendarAsync({
      title: 'LifeGate Health',
      color: '#0AADA2',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar?.source?.id,
      source: defaultCalendar?.source ?? {
        isLocalAccount: true,
        name: 'LifeGate',
        type: Calendar.SourceType.LOCAL,
      },
      name: 'lifegate-health',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
    return newId;
  } catch {
    return null;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Schedule a calendar event and a local push notification for a follow-up.
 *
 * @param diagnosisId  The diagnosis ID (used as storage key for cancellation).
 * @param condition    The condition name for the calendar event title.
 * @param plan         The follow-up plan returned by EDIS.
 * @param followUpDate Optional pre-computed date string from the server
 *                     (ISO-8601). Falls back to local calculation from daysUntil.
 */
export async function scheduleFollowUp(
  diagnosisId: string,
  condition: string,
  plan: FollowUpPlan,
  followUpDate?: string,
): Promise<FollowUpScheduleResult> {
  // Compute the target date — prefer the server-supplied value for consistency.
  const target = followUpDate
    ? new Date(followUpDate)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + plan.daysUntil);
        return d;
      })();

  // Set notification time to 9 AM local time on the follow-up date.
  const notifyAt = new Date(target);
  notifyAt.setHours(9, 0, 0, 0);

  const triggerDesc =
    plan.triggerSymptoms.length > 0
      ? `\n\nSeek care immediately if you experience: ${plan.triggerSymptoms.join(', ')}.`
      : '';

  let calendarEventId: string | null = null;
  let notificationId: string | null = null;

  // ── Calendar event ──────────────────────────────────────────────────────────
  const calendarGranted = await requestCalendarPermission();
  if (calendarGranted) {
    const calendarId = await getOrCreateLifeGateCalendarId();
    if (calendarId) {
      try {
        const eventStart = new Date(target);
        eventStart.setHours(9, 0, 0, 0);
        const eventEnd = new Date(eventStart.getTime() + 30 * 60 * 1000); // 30 min

        calendarEventId = await Calendar.createEventAsync(calendarId, {
          title: `LifeGate Follow-up: ${condition}`,
          notes:
            `Time to check in on your ${condition}.\n\nDid your symptoms improve?` +
            triggerDesc,
          startDate: eventStart,
          endDate: eventEnd,
          alarms: [{ relativeOffset: -30 }], // 30-min device reminder
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch {
        calendarEventId = null;
      }
    }
  }

  // ── Local push notification ─────────────────────────────────────────────────
  // NOTE: The server handles the follow-up push notification via its cron worker,
  // which marks follow_up_notified_at to prevent duplicates. Scheduling a local
  // push here would cause the patient to receive two notifications on the same day.
  const notificationId: string | null = null;

  // Persist IDs so callers can cancel later.
  await AsyncStorage.setItem(
    STORAGE_KEY_PREFIX + diagnosisId,
    JSON.stringify({ calendarEventId, notificationId }),
  );

  return { followUpDate: target, calendarEventId, notificationId };
}

/**
 * Cancel a previously scheduled follow-up (calendar event + notification).
 * Safe to call even if the follow-up was never scheduled.
 */
export async function cancelFollowUp(diagnosisId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + diagnosisId);
  if (!raw) return;

  try {
    const { calendarEventId, notificationId } = JSON.parse(raw) as {
      calendarEventId: string | null;
      notificationId: string | null;
    };

    if (calendarEventId) {
      await Calendar.deleteEventAsync(calendarEventId).catch(() => {});
    }
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
    }
  } catch {
    // Ignore parse errors.
  }

  await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + diagnosisId);
}
