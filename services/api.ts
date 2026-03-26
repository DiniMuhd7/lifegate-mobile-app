import axios, { AxiosInstance} from 'axios';
import { getToken } from '../utils/tokenStorage';

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
        console.log('📦 Sending FormData request...');
      }

    } catch (error) {
      console.error('Interceptor error:', error);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.request.use(async (config) => {
  const token = await getToken().catch(() => null);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


/**
 * Response interceptor: Handle 401 errors (unauthorized)
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.log('Unauthorized (401) - clearing token and user session');
      try {
        // await removeToken();
      } catch (err) {
        console.error('Error clearing token on 401:', err);
      }
    }
    return Promise.reject(error);
  }
);
export default api;
