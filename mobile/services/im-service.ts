import api from './api';
import { IMMessage } from '../types/im-types';

export const IMService = {
  /** Fetch full message history for a diagnosis. Also marks incoming msgs as read server-side. */
  getMessages: async (diagnosisId: string): Promise<IMMessage[]> => {
    const res = await api.get(`/im/${diagnosisId}`);
    return (res.data?.data as IMMessage[]) ?? [];
  },

  /** Send a new message. Returns the saved message record. */
  sendMessage: async (diagnosisId: string, content: string): Promise<IMMessage> => {
    const res = await api.post(`/im/${diagnosisId}`, { content });
    return res.data?.data as IMMessage;
  },

  /** Explicitly mark all incoming messages as read. */
  markRead: async (diagnosisId: string): Promise<void> => {
    await api.put(`/im/${diagnosisId}/read`);
  },

  /** Return the unread count for the calling user. */
  getUnreadCount: async (diagnosisId: string): Promise<number> => {
    const res = await api.get(`/im/${diagnosisId}/unread`);
    return (res.data?.data?.count as number) ?? 0;
  },
};
