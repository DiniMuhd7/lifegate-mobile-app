import axios, { AxiosInstance, AxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { getRefreshToken, removeRefreshToken, removeToken } from '../utils/tokenStorage';

const PRODUCTION_API_URL = 'https://edis.dshub.com.ng/api';

/**
 * Resolve the correct API base URL at runtime.
 *
 * Priority order:
 * 1. If EXPO_PUBLIC_API_URL is set to a non-local URL (e.g. Render), use it
 *    on all platforms — this lets you explicitly override the backend.
 * 2. On native (no window), fall back to the Render prod URL.
 * 3. On web with a Codespaces hostname, derive the URL from window.location
 *    by replacing the forwarded port segment with -80 (nginx backend).
 * 4. Localhost/LAN dev — use the same host on port 80.
 * 5. Hosted web builds without EXPO_PUBLIC_API_URL fall back to Render prod.
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  // If explicitly configured to a remote URL, honour it everywhere.
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // Native (React Native) — no window object
  if (typeof window === 'undefined') {
    // Do not send a device to localhost when a development .env file is
    // present. On a phone, localhost refers to the phone itself rather than
    // the development machine, so authentication fails as a network error.
    // Remote EXPO_PUBLIC_API_URL values have already been honoured above.
    return PRODUCTION_API_URL;
  }

  const hostname = window.location.hostname;

  // GitHub Codespaces forwarded port: {name}-{port}.app.github.dev
  const codespaceMatch = hostname.match(/^(.+?)-(\d+)(\.app\.github\.dev)$/);
  if (codespaceMatch) {
    // Replace the current port segment with -80 (nginx backend)
    return `https://${codespaceMatch[1]}-80${codespaceMatch[3]}/api`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    // Localhost / LAN dev — nginx is on port 80 of the same host
    return `http://${hostname}/api`;
  }

  // Hosted web builds must not derive http://<frontend-host>/api because that
  // causes mixed-content failures on HTTPS and points at the static site, not
  // the Go API. Use the known Render backend unless an env override was baked in.
  return PRODUCTION_API_URL;
}

const BASE_URL = resolveBaseUrl();

// EDIS hard wall is 120 s (3 retries × 50 s each). Use 150 s here so the
// server always has time to complete its retry cycle and return a graceful
// response rather than the client cutting the socket mid-flight.
const TIMEOUT_MS = 150_000;

// Idempotent GET requests are retried up to this many times on network error.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── In-memory access token ────────────────────────────────────────────────
// The access token lives only in memory to limit XSS exposure.
// The refresh token is persisted to SecureStore via tokenStorage.ts.
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

/**
 * Decode the exp claim from a JWT (base64url-encoded payload) without
 * verifying the signature. Returns -1 on any parse failure.
 */
function jwtExp(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return -1;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : -1;
  } catch {
    return -1;
  }
}

// ─── Silent refresh state ──────────────────────────────────────────────────
// Ensures concurrent 401 responses only trigger one refresh attempt.
let isRefreshing = false;
let pendingResolvers: Array<(token: string | null) => void> = [];

function onRefreshComplete(token: string | null) {
  pendingResolvers.forEach((resolve) => resolve(token));
  pendingResolvers = [];
}

/**
 * Create and configure axios instance with interceptors
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
});

/**
 * Request interceptor:
 *  1. Attach access token from memory (proactively refreshing if near expiry).
 *  2. Handle FormData content-type.
 *  3. Offline guard.
 */
api.interceptors.request.use(
  async (config) => {
    try {
      let token = _accessToken;

      // Proactive refresh: if the token expires within 60 s, renew it now
      // so the request goes out with a fresh token rather than getting a 401.
      if (token) {
        const exp = jwtExp(token);
        const secsToExpiry = exp - Math.floor(Date.now() / 1000);
        if (exp !== -1 && secsToExpiry < 60) {
          const refreshToken = await getRefreshToken().catch(() => null);
          if (refreshToken) {
            try {
              // Import lazily to avoid circular dependency.
              const { AuthService } = await import('./auth-service');
              const result = await AuthService.refresh(refreshToken);
              if (result.success && result.token) {
                setAccessToken(result.token);
                token = result.token;
                if (result.refreshToken) {
                  const { saveRefreshToken } = await import('../utils/tokenStorage');
                  await saveRefreshToken(result.refreshToken);
                }
              }
            } catch {
              // Proactive refresh failed — let the request proceed and handle 401 reactively.
            }
          }
        }
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      }
    } catch {
      // ignore token fetch errors
    }

    // Offline guard — fail-fast only when the device explicitly reports no connection.
    // We intentionally ignore `isInternetReachable` here: on Android (especially
    // in Expo Go over a tunnel), the ICMP reachability probe often returns false
    // even when the device has a working internet connection, which would
    // incorrectly block every mutation.
    const netState = await NetInfo.fetch();
    if (netState.isConnected === false) {
      const err = new Error('OFFLINE') as AxiosError;
      (err as any).isOffline = true;
      return Promise.reject(err);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor:
 *  1. On 401 → attempt one silent token refresh, then retry the original request.
 *     If refresh fails, log the user out.
 *  2. Serialize concurrent 401 responses — only one refresh round-trip happens.
 *  3. Retry GET requests on network error (up to MAX_RETRIES times).
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;

    // Never attempt a silent token refresh for auth endpoints themselves
    // (/auth/login, /auth/refresh, /auth/logout).  A 401 from those endpoints
    // is a legitimate rejection (wrong credentials, expired token) and should
    // be surfaced directly to the caller — not intercepted.
    const reqUrl: string = config?.url ?? '';
    const isAuthEndpoint =
      reqUrl.includes('/auth/login') ||
      reqUrl.includes('/auth/refresh') ||
      reqUrl.includes('/auth/logout');

    if (error.response?.status === 401 && !config?._refreshed && !isAuthEndpoint) {
      // Prevent retry loops — mark this request as already-retried.
      config._refreshed = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshToken = await getRefreshToken().catch(() => null);
          if (!refreshToken) throw new Error('no refresh token');

          const { AuthService } = await import('./auth-service');
          const result = await AuthService.refresh(refreshToken);

          if (!result.success || !result.token) throw new Error('refresh failed');

          setAccessToken(result.token);
          if (result.refreshToken) {
            const { saveRefreshToken } = await import('../utils/tokenStorage');
            await saveRefreshToken(result.refreshToken);
          }
          onRefreshComplete(result.token);
        } catch {
          // Refresh failed — clear everything and force logout.
          onRefreshComplete(null);
          setAccessToken(null);
          await removeToken().catch(() => {});
          await removeRefreshToken().catch(() => {});
          try {
            const { useAuthStore } = await import('../stores/auth/auth-store');
            useAuthStore.setState({ user: null, isAuthenticated: false });
          } catch {
            // best-effort
          }
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Another request is already refreshing — queue this one.
        const newToken = await new Promise<string | null>((resolve) => {
          pendingResolvers.push(resolve);
        });
        if (!newToken) return Promise.reject(error);
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }

      // Retry with the new access token.
      config.headers.Authorization = `Bearer ${_accessToken}`;
      return api(config);
    }

    // Retry GET requests on network / timeout errors (not on 4xx/5xx)
    const isNetworkError = !error.response;
    const isGet = config?.method?.toLowerCase() === 'get';
    const retryCount: number = config?._retryCount ?? 0;

    if (isNetworkError && isGet && retryCount < MAX_RETRIES) {
      config._retryCount = retryCount + 1;
      await sleep(RETRY_DELAY_MS * config._retryCount);
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;
