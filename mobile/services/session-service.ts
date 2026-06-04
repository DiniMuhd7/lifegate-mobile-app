/**
 * Session Service
 * CRUD API calls for server-side chat sessions.
 *
 * Endpoints:
 *   GET    /sessions            — list all sessions for the authenticated user
 *   POST   /sessions            — create a new session
 *   GET    /sessions/incomplete — fetch the most recent abandoned session (for resume prompt)
 *   GET    /sessions/:id        — get a single session
 *   PUT    /sessions/:id        — update session (messages, title, mode, status)
 *   DELETE /sessions/:id        — delete a session
 */

import api from './api';
import type { ServerSession, CreateSessionInput, UpdateSessionInput } from 'types/chat-types';

type APIResponse<T> = { success: boolean; message: string; data: T };

export const SessionService = {
  /** Fetch all sessions for the authenticated user, newest first. */
  async list(): Promise<ServerSession[]> {
    const res = await api.get<APIResponse<ServerSession[]>>('/sessions');
    return res.data.data ?? [];
  },

  /** Create a new chat session. */
  async create(input: CreateSessionInput): Promise<ServerSession> {
    const res = await api.post<APIResponse<ServerSession>>('/sessions', input);
    return res.data.data;
  },

  /**
   * Fetch the most recently abandoned session, if one exists within the
   * 24-hour server-side TTL window. Returns null when there is nothing to resume.
   */
  async getIncomplete(): Promise<ServerSession | null> {
    const res = await api.get<APIResponse<ServerSession | null>>('/sessions/incomplete');
    return res.data.data ?? null;
  },

  /** Fetch a single session by ID. */
  async get(id: string): Promise<ServerSession> {
    const res = await api.get<APIResponse<ServerSession>>(`/sessions/${id}`);
    return res.data.data;
  },

  /**
   * Patch a session. Only the supplied fields are updated; omitted fields are
   * left unchanged on the server.
   */
  async update(id: string, input: UpdateSessionInput): Promise<ServerSession> {
    const res = await api.put<APIResponse<ServerSession>>(`/sessions/${id}`, input);
    return res.data.data;
  },

  /** Delete a session permanently. */
  async delete(id: string): Promise<void> {
    await api.delete(`/sessions/${id}`);
  },
};
