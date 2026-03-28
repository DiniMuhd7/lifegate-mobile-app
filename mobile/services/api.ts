import axios, { AxiosInstance} from 'axios';
import { getToken, removeToken } from '../utils/tokenStorage';

const BASE_URL = 'https://lifegatemobilebackend-2.onrender.com/api';
// const BASE_URL = 'https://lifegatemobilebackend-1.onrender.com/api';
// const BASE_URL = 'http://10.73.93.229:5000/api';

/**
 * Create and configure axios instance with interceptors
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

/**
 * Request interceptor: Attach JWT token to every request & handle FormData
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

    return config;
  },
  (error) => Promise.reject(error)
);


/**
 * Response interceptor: Handle 401 errors (unauthorized)
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await removeToken();
        // Dynamic import avoids circular dependency (api → store → api)
        const { useAuthStore } = await import('../stores/auth/auth-store');
        useAuthStore.setState({ user: null, isAuthenticated: false });
      } catch {
        // best-effort cleanup
      }
    }
    return Promise.reject(error);
  }
);
export default api;
