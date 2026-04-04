/**
 * websocket-service.ts
 *
 * Singleton WebSocket client for LifeGate real-time events.
 *
 * Server protocol: text frames in the format  "eventname:json_payload"
 * Client protocol: JSON control frames
 *   { "action": "subscribe",   "events": ["diagnosis.update"] }
 *   { "action": "unsubscribe", "events": ["diagnosis.update"] }
 *
 * Usage:
 *   import wsService from '@/services/websocket-service';
 *   wsService.connect(token);
 *   const unsub = wsService.on('diagnosis.update', (data) => { ... });
 *   // on logout / screen unmount:
 *   unsub();
 *   wsService.disconnect();
 */

type EventCallback = (data: unknown) => void;

const MAX_BACKOFF_MS = 30_000;

function resolveWsUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

  // Convert http(s)://host/api  →  ws(s)://host/ws
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
  }

  if (typeof window === 'undefined') {
    // Native fallback
    return 'wss://lifegate-backend.onrender.com/ws';
  }

  const { hostname, protocol } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  const codespaceMatch = hostname.match(/^(.+?)-(\d+)(\.app\.github\.dev)$/);
  if (codespaceMatch) {
    return `wss://${codespaceMatch[1]}-80${codespaceMatch[3]}/ws`;
  }

  return `${wsProtocol}//${hostname}/ws`;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private pendingSubs: Set<string> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private stopped = false;

  /** Connect (or reconnect) with a JWT token for user-aware broadcasting. */
  connect(token: string): void {
    this.token = token;
    this.stopped = false;
    this.retryCount = 0;
    this._open();
  }

  /** Permanently close the connection and cancel any pending reconnect. */
  disconnect(): void {
    this.stopped = true;
    this._clearReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register a listener for the given event name.
   * Returns an unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      this._sendSubscribe([event]);
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  /** Remove a specific listener. Sends an unsubscribe frame when the last listener for an event is removed. */
  off(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this.listeners.delete(event);
      this._sendUnsubscribe([event]);
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _open(): void {
    const base = resolveWsUrl();
    const url = this.token ? `${base}?token=${encodeURIComponent(this.token)}` : base;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.retryCount = 0;
      // Re-subscribe to all events the app currently cares about.
      const events = Array.from(this.listeners.keys());
      if (events.length > 0) {
        this._sendSubscribe(events);
      }
      // Flush pending subscriptions that arrived before the connection opened.
      if (this.pendingSubs.size > 0) {
        this._sendSubscribe(Array.from(this.pendingSubs));
        this.pendingSubs.clear();
      }
    };

    this.ws.onmessage = (event) => {
      const raw = event.data as string;
      const colonIdx = raw.indexOf(':');
      if (colonIdx === -1) return;
      const eventName = raw.slice(0, colonIdx);
      const jsonStr = raw.slice(colonIdx + 1);
      let payload: unknown;
      try {
        payload = JSON.parse(jsonStr);
      } catch {
        payload = jsonStr;
      }
      this._emit(eventName, payload);
    };

    this.ws.onerror = () => {
      // onclose fires immediately after, which handles retry.
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.stopped) {
        this._scheduleReconnect();
      }
    };
  }

  private _emit(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.warn('[WS] listener error:', e);
      }
    });
  }

  private _sendSubscribe(events: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      events.forEach((e) => this.pendingSubs.add(e));
      return;
    }
    this.ws.send(JSON.stringify({ action: 'subscribe', events }));
  }

  private _sendUnsubscribe(events: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'unsubscribe', events }));
  }

  private _scheduleReconnect(): void {
    this._clearReconnect();
    const delay = Math.min(1_000 * 2 ** this.retryCount, MAX_BACKOFF_MS);
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped) this._open();
    }, delay);
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

const wsService = new WebSocketService();
export default wsService;
