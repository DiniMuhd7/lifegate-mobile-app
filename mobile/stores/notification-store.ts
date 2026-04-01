import { create } from 'zustand';

export interface PhysicianNotification {
  id: string;
  type: 'new_case' | 'case_status';
  caseId: string;
  message: string;
  timestamp: number;
  isRead: boolean;
}

interface NotificationStore {
  notifications: PhysicianNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<PhysicianNotification, 'id' | 'timestamp' | 'isRead'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const newItem: PhysicianNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      isRead: false,
    };
    set((state) => ({
      notifications: [newItem, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markRead: (id) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      };
    });
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));
