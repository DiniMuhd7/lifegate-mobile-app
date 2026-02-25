import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getToken, removeToken } from '../utils/tokenStorage';

const BASE_URL = 'https://lifegatemobilebackend-1.onrender.com/api';

/**
 * Create and configure axios instance with interceptors
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Attach JWT token to every request
 */
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('Token attached to request');
      }
    } catch (error) {
      console.error('Error retrieving token for request:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle 401 errors (unauthorized)
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.log('Unauthorized (401) - clearing token and user session');
      try {
        await removeToken();
        // Trigger logout in the app - this would be handled by the auth store
        // The store checks for this error and clears state appropriately
      } catch (err) {
        console.error('Error clearing token on 401:', err);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
