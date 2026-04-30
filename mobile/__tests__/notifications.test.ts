/**
 * Notification system tests
 *
 * Covers:
 *  Push notifications (pushNotifications.ts):
 *   - registerPhysicianPushToken() is a no-op on web
 *   - registerPhysicianPushToken() is a no-op on non-device (simulator)
 *   - registerPhysicianPushToken() requests permission, gets token, calls backend
 *   - registerPatientPushToken() is a no-op on web
 *   - registerPatientPushToken() calls POST /push-token with the Expo token
 *   - addNotificationResponseListener() returns stub on web (no crash)
 *   - addNotificationResponseListener() wires response listener on native
 *
 *  In-app notification store (notification-store.ts):
 *   - addNotification() appends item with id/timestamp/isRead=false
 *   - addNotification() increments unreadCount and caps list at 50
 *   - markRead() marks single notification and recalculates unreadCount
 *   - markAllRead() zeroes unreadCount
 *   - clearAll() empties list and resets unreadCount
 */

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockPlatformOS = 'ios';
let mockIsDevice = true;

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();

// ─── Module-level mocks ───────────────────────────────────────────────────────

jest.mock('react-native', () => ({
  Platform: { get OS() { return mockPlatformOS; } },
}));

jest.mock('expo-device', () => ({ get isDevice() { return mockIsDevice; } }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
    easConfig: null,
  },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    mockAddNotificationResponseReceivedListener(...args),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
}));

jest.mock('../services/professional-service', () => ({
  ProfessionalService: {
    registerPushToken: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// ─── Static imports (after mocks) ─────────────────────────────────────────────

import {
  registerPhysicianPushToken,
  registerPatientPushToken,
  addNotificationResponseListener,
} from '../utils/pushNotifications';
import { ProfessionalService } from '../services/professional-service';
import api from '../services/api';
import { useNotificationStore } from '../stores/notification-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRegisterPushToken = ProfessionalService.registerPushToken as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockApiPost = (api as any).post as jest.Mock;

function resetMocks() {
  jest.clearAllMocks();
  mockPlatformOS = 'ios';
  mockIsDevice = true;
  mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test-token]' });
  mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
  mockRegisterPushToken.mockResolvedValue(undefined);
  mockApiPost.mockResolvedValue({ data: { success: true } });
}

// ─── Push notification utility tests ─────────────────────────────────────────

describe('pushNotifications', () => {
  beforeEach(resetMocks);

  describe('registerPhysicianPushToken', () => {
    it('is a no-op on web platform', async () => {
      mockPlatformOS = 'web';
      await registerPhysicianPushToken();
      expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
      expect(mockRegisterPushToken).not.toHaveBeenCalled();
    });

    it('is a no-op when not on a physical device', async () => {
      mockIsDevice = false;
      await registerPhysicianPushToken();
      expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    });

    it('registers token when permission already granted', async () => {
      await registerPhysicianPushToken();
      expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
      expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[test-token]');
    });

    it('requests permission when not yet granted then registers', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await registerPhysicianPushToken();
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
      expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[test-token]');
    });

    it('does nothing when permission is denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await registerPhysicianPushToken();
      expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(mockRegisterPushToken).not.toHaveBeenCalled();
    });
  });

  describe('registerPatientPushToken', () => {
    it('is a no-op on web platform', async () => {
      mockPlatformOS = 'web';
      await registerPatientPushToken();
      expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('POSTs to /push-token with the Expo token', async () => {
      await registerPatientPushToken();
      expect(mockApiPost).toHaveBeenCalledWith('/push-token', {
        token: 'ExponentPushToken[test-token]',
      });
    });

    it('does nothing when permission is denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await registerPatientPushToken();
      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  describe('addNotificationResponseListener', () => {
    it('returns a stub subscription on web with no-op remove()', () => {
      mockPlatformOS = 'web';
      const handler = jest.fn();
      const sub = addNotificationResponseListener(handler);
      expect(sub).toHaveProperty('remove');
      expect(() => sub.remove()).not.toThrow();
      expect(mockAddNotificationResponseReceivedListener).not.toHaveBeenCalled();
    });

    it('wires Notifications listener on native and calls handler with caseId', () => {
      let capturedListener: ((r: unknown) => void) | null = null;
      mockAddNotificationResponseReceivedListener.mockImplementation(
        (fn: (r: unknown) => void) => {
          capturedListener = fn;
          return { remove: jest.fn() };
        },
      );
      const handler = jest.fn();
      addNotificationResponseListener(handler);
      expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalled();
      capturedListener!({
        notification: { request: { content: { data: { caseId: 'case-123' } } } },
      });
      expect(handler).toHaveBeenCalledWith('case-123');
    });

    it('does not call handler when caseId is absent', () => {
      let capturedListener: ((r: unknown) => void) | null = null;
      mockAddNotificationResponseReceivedListener.mockImplementation(
        (fn: (r: unknown) => void) => {
          capturedListener = fn;
          return { remove: jest.fn() };
        },
      );
      const handler = jest.fn();
      addNotificationResponseListener(handler);
      capturedListener!({ notification: { request: { content: { data: {} } } } });
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ─── Notification store tests ─────────────────────────────────────────────────

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it('addNotification appends a new item with isRead=false and increments unreadCount', () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ type: 'new_case', caseId: 'c1', message: 'New case!' });
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: 'new_case',
      caseId: 'c1',
      message: 'New case!',
      isRead: false,
    });
    expect(state.unreadCount).toBe(1);
  });

  it('addNotification caps the list at 50 items', () => {
    const { addNotification } = useNotificationStore.getState();
    for (let i = 0; i < 55; i++) {
      addNotification({ type: 'case_status', caseId: `c${i}`, message: `msg ${i}` });
    }
    expect(useNotificationStore.getState().notifications).toHaveLength(50);
  });

  it('markRead marks the correct notification and recalculates unreadCount', () => {
    const { addNotification, markRead } = useNotificationStore.getState();
    addNotification({ type: 'new_case', caseId: 'c1', message: 'A' });
    addNotification({ type: 'im_message', caseId: 'c2', message: 'B' });
    const { notifications } = useNotificationStore.getState();
    const firstId = notifications[0].id; // newest-first
    markRead(firstId);
    const after = useNotificationStore.getState();
    expect(after.notifications.find((n) => n.id === firstId)?.isRead).toBe(true);
    expect(after.unreadCount).toBe(1);
  });

  it('markAllRead zeroes unreadCount and marks everything read', () => {
    const { addNotification, markAllRead } = useNotificationStore.getState();
    addNotification({ type: 'new_case', caseId: 'c1', message: 'A' });
    addNotification({ type: 'im_message', caseId: 'c2', message: 'B' });
    markAllRead();
    const after = useNotificationStore.getState();
    expect(after.unreadCount).toBe(0);
    expect(after.notifications.every((n) => n.isRead)).toBe(true);
  });

  it('clearAll resets the list and unreadCount to zero', () => {
    const { addNotification, clearAll } = useNotificationStore.getState();
    addNotification({ type: 'new_case', caseId: 'c1', message: 'A' });
    clearAll();
    const after = useNotificationStore.getState();
    expect(after.notifications).toHaveLength(0);
    expect(after.unreadCount).toBe(0);
  });

  it('notifications are ordered newest-first', () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification({ type: 'new_case', caseId: 'first', message: 'First' });
    addNotification({ type: 'case_status', caseId: 'second', message: 'Second' });
    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].caseId).toBe('second');
    expect(notifications[1].caseId).toBe('first');
  });
});
