import axios, { AxiosInstance, AxiosError } from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { getToken, removeToken } from '../utils/tokenStorage';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lifegatemobilebackend-2.onrender.com/api';

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

    // Offline guard — fail-fast for mutations so callers can queue offline
    const netState = await NetInfo.fetch();
    const online = netState.isConnected && netState.isInternetReachable;
    if (!online) {
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
