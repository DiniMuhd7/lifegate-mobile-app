import api from './api';
import { saveToken, removeToken } from '../utils/tokenStorage';
import { AuthUser, HealthProfessionalUser, BackendLoginResponse } from '../types/auth-types';

/**
 * Login request payload
 */
interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Register request payload
 */
interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
  dob: string;
  gender: string;
  language: string;
  healthHistory: string;
  role: 'user' | 'health_professional';
  specialization?: string;
  licenseNumber?: string;
  certificateName?: string;
  certificateId?: string;
  certificateIssueDate?: string;
  yearsOfExperience?: string;
}

/**
 * Response with user data (token already saved separately)
 */
interface AuthResponse {
  success: boolean;
  user?: AuthUser | HealthProfessionalUser;
  message?: string;
}

export const AuthService = {

  /**
   * Login user with email and password
   * Calls POST /auth/login
   * Saves token to secure storage
   * Returns user data
   */
  async login(payload: LoginPayload): Promise<AuthResponse> {
    try {
      console.log('Sending login request to backend...');

      const response = await api.post<BackendLoginResponse>('/auth/login', payload);

      if (!response.data.success || !response.data.data) {
        console.log('Login failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Login failed',
        };
      }

      const { token, user } = response.data.data;

      // Save token to secure storage
      await saveToken(token);

      console.log('Login successful - token saved');

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      console.error('Login error:', error.message);
      const message = error.response?.data?.message || 'Network error. Please try again.';
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * Register new user
   * Calls POST /auth/register
   * Saves token to secure storage
   * Returns user data
   */
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      console.log('Sending registration request to backend...');

      const response = await api.post<BackendLoginResponse>('/auth/register', payload);

      if (!response.data.success || !response.data.data) {
        console.log('Registration failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Registration failed',
        };
      }

      const { token, user } = response.data.data;

      // Save token to secure storage
      await saveToken(token);

      console.log('Registration successful - token saved');

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      console.error('Registration error:', error.message);
      const message = error.response?.data?.message || 'Network error. Please try again.';
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * Health professional login
   * Uses same endpoint as regular login - backend differentiates by credentials/response role
   */
  async healthProfessionalLogin(payload: LoginPayload): Promise<AuthResponse> {
    try {
      console.log('Sending health professional login request to backend...');

      const response = await api.post<BackendLoginResponse>('/auth/login', payload);

      if (!response.data.success || !response.data.data) {
        console.log('Health professional login failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Login failed',
        };
      }

      const { token, user } = response.data.data;

      // Save token to secure storage
      await saveToken(token);

      console.log('Health professional login successful - token saved');

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      console.error('Health professional login error:', error.message);
      const message = error.response?.data?.message || 'Network error. Please try again.';
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * Register health professional
   * Uses same endpoint as regular registration - backend differentiates by role in request
   * Saves token to secure storage
   * Returns user data with professional details
   */
  async healthProfessionalRegister(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      console.log('Sending health professional registration request to backend...');

      const response = await api.post<BackendLoginResponse>('/auth/register', payload);

      if (!response.data.success || !response.data.data) {
        console.log('Health professional registration failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Registration failed',
        };
      }

      const { token, user } = response.data.data;

      // Save token to secure storage
      await saveToken(token);

      console.log('Health professional registration successful - token saved');

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      console.error('Health professional registration error:', error.message);
      const message = error.response?.data?.message || 'Network error. Please try again.';
      return {
        success: false,
        message,
      };
    }
  },
};