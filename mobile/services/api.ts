import axios, { AxiosInstance, AxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { getToken, removeToken } from '../utils/tokenStorage';

/**
 * Resolve the correct API base URL at runtime.
 *
 * Priority order:
 * 1. If EXPO_PUBLIC_API_URL is set to a non-local URL (e.g. Render), use it
 *    on all platforms — this lets you explicitly override the backend.
 * 2. On native (no window), fall back to the Render prod URL.
 * 3. On web with a Codespaces hostname, derive the URL from window.location
 *    by replacing the forwarded port segment with -80 (nginx backend).
 * 4. Plain localhost/LAN dev — use the same host on port 80.
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  // If explicitly configured to a remote URL, honour it everywhere.
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // Native (React Native) — no window object
  if (typeof window === 'undefined') {
    return envUrl ?? 'https://lifegatemobilebackend-2.onrender.com/api';
  }

  const hostname = window.location.hostname;

  // GitHub Codespaces forwarded port: {name}-{port}.app.github.dev
  const codespaceMatch = hostname.match(/^(.+?)-(\d+)(\.app\.github\.dev)$/);
  if (codespaceMatch) {
    // Replace the current port segment with -80 (nginx backend)
    return `https://${codespaceMatch[1]}-80${codespaceMatch[3]}/api`;
  }

  // Localhost / LAN dev — nginx is on port 80 of the same host
  return `http://${hostname}/api`;
}

const BASE_URL = resolveBaseUrl();

// Render free-tier cold starts can take up to 50 s; use 60 s to be safe.
const TIMEOUT_MS = 60_000;

// Idempotent GET requests are retried up to this many times on network error.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Create and configure axios instance with interceptors
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
});

/**
 * Request interceptor: Attach JWT token to every request & handle FormData.
 * Also gates network requests — throws an explicit offline error so callers
 * can distinguish network unavailability from server errors.
 */
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken().catch(() => null);

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      }
    } catch {
      // ignore token fetch errors
    }

    // Offline guard — fail-fast for mutations so callers can queue offline.
    // On web, isInternetReachable is null (unknown) so we only block when it
    // is explicitly false; null is treated as "assumed online".
    const netState = await NetInfo.fetch();
    const isDefinitelyOffline =
      netState.isConnected === false || netState.isInternetReachable === false;
    if (isDefinitelyOffline) {
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
 *  1. Handle 401 → clear token & reset auth store.
 *  2. Retry GET requests on network error (up to MAX_RETRIES times).
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as any;

    // 401 → log the user out
    if (error.response?.status === 401) {
      try {
        await removeToken();
        const { useAuthStore } = await import('../stores/auth/auth-store');
        useAuthStore.setState({ user: null, isAuthenticated: false });
      } catch {
        // best-effort cleanup
      }
      return Promise.reject(error);
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
