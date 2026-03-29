import api from './api';
import { saveToken, getToken } from '../utils/tokenStorage';
import { extractErrorMessage } from '../utils/error-utils';
import {
  BackendLoginResponse,
  LoginPayload,
  RegisterPayload,
  AuthResponse,
  Physician2FAResponse,
  RegistrationStartPayload,
  RegistrationStartResponse,
  RegistrationVerifyPayload,
  RegistrationVerifyResponse,
  RegistrationResendResponse,
  VerifyResetCodeResponse,
  ResetPasswordResponse,
} from '../types/auth-types';

export const AuthService = {
  /**
   * Login user with email and password.
   * Calls POST /auth/login.
   * Does NOT persist the token — that is the store's responsibility (based on rememberMe).
   * For physicians, returns { requires2FA: true, email } instead of a token.
   */
  async login(payload: LoginPayload): Promise<AuthResponse> {
    try {
      const response = await api.post<BackendLoginResponse>('/auth/login', payload);

      if (!response.data.success) {
        return { success: false, message: response.data.message || 'Login failed' };
      }

      const data = response.data.data;

      // Physician needs to complete 2FA before receiving a JWT.
      if (data?.requires2FA) {
        return { success: true, requires2FA: true, email: data.email ?? payload.email };
      }

      if (!data?.token || !data?.user) {
        return { success: false, message: response.data.message || 'Login failed' };
      }

      return { success: true, user: data.user, token: data.token };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Verify physician 2FA code and receive a JWT.
   * POST /auth/login/verify-2fa
   */
  async verifyPhysician2FA(email: string, otp: string): Promise<Physician2FAResponse> {
    try {
      const response = await api.post<BackendLoginResponse>('/auth/login/verify-2fa', {
        email,
        otp,
      });

      if (!response.data.success || !response.data.data?.token || !response.data.data?.user) {
        return { success: false, message: response.data.message || 'Verification failed' };
      }

      return {
        success: true,
        token: response.data.data.token,
        user: response.data.data.user,
      };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Resend the physician 2FA login code.
   * POST /auth/login/resend-2fa
   */
  async resendPhysician2FA(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        '/auth/login/resend-2fa',
        { email }
      );
      return { success: response.data.success, message: response.data.message };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Register new user with unified payload.
   * Calls POST /auth/register.
   * Saves token to secure storage (auto-login on registration).
   */
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      const response = await api.post<BackendLoginResponse>('/auth/register', payload);

      if (!response.data.success || !response.data.data) {
        return {
          success: false,
          message: response.data.message || 'Registration failed',
        };
      }

      const { token, user } = response.data.data;
      await saveToken(token);
      return { success: true, user };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Stage 1 of the two-stage registration flow.
   * Submits registration details and triggers OTP email.
   * POST /auth/register/start
   */
  async startRegistration(
    payload: FormData | RegistrationStartPayload
  ): Promise<RegistrationStartResponse> {
    try {
      const isFormData = payload instanceof FormData;
      const { data } = await api.post<RegistrationStartResponse>(
        '/auth/register/start',
        payload,
        isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
      );
      return data;
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Stage 2 of the two-stage registration flow.
   * Verifies OTP and completes registration.
   * POST /auth/register/verify
   * Saves token to secure storage (user is automatically logged in).
   */
  async verifyRegistration(
    payload: RegistrationVerifyPayload
  ): Promise<RegistrationVerifyResponse> {
    try {
      const response = await api.post<RegistrationVerifyResponse>('/auth/register/verify', payload);

      if (!response.data.success || !response.data.data) {
        return {
          success: false,
          message: response.data.message || 'Verification failed',
        };
      }

      const { token, user } = response.data.data;
      await saveToken(token);

      return {
        success: true,
        message: response.data.message,
        data: { token, user },
      };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Resend OTP during registration verification.
   * POST /auth/register/resend
   */
  async resendRegistrationOTP(email: string): Promise<RegistrationResendResponse> {
    try {
      const response = await api.post<RegistrationResendResponse>('/auth/register/resend', {
        email,
      });

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'Failed to resend code',
        };
      }

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Send OTP for password recovery.
   * POST /auth/password/send-reset-code
   */
  async sendOtpForPasswordRecovery(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/auth/password/send-reset-code', { email });
      return { success: response.data.success, message: response.data.message };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Verify reset code for password recovery.
   * POST /auth/password/verify-reset-code
   */
  async verifyOtpForPasswordRecovery(
    email: string,
    code: string
  ): Promise<VerifyResetCodeResponse> {
    try {
      const response = await api.post<VerifyResetCodeResponse>('/auth/password/verify-reset-code', {
        email,
        code,
      });

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'Verification failed',
          data: { resetToken: '' },
        };
      }

      return response.data;
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error),
        data: { resetToken: '' },
      };
    }
  },

  /**
   * Reset password with a verified reset token.
   * POST /auth/password/reset
   */
  async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResponse> {
    try {
      const response = await api.post<ResetPasswordResponse>('/auth/password/reset', {
        token,
        newPassword,
      });

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'Password reset failed',
        };
      }

      return response.data;
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Send OTP during signup for email verification.
   * TODO: wire to real endpoint when backend is ready.
   */
  async sendOtpForSignup(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Placeholder — replace with real API call when endpoint exists
      void email;
      return { success: true, message: 'Verification code sent' };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Verify OTP during signup.
   * TODO: wire to real endpoint when backend is ready.
   */
  async verifyOtpForSignup(
    email: string,
    otp: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Placeholder — replace with real API call when endpoint exists
      void email;
      void otp;
      return { success: true, message: 'Email verified successfully' };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Resend OTP (both password reset and signup flows).
   */
  async resendOtp(
    email: string,
    type: 'password-reset' | 'signup'
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (type === 'signup') {
        const result = await this.resendRegistrationOTP(email);
        return { success: result.success, message: result.message ?? 'Code resent' };
      }

      const response = await api.post<{ success: boolean; message: string }>(
        '/auth/password/send-reset-code',
        { email }
      );
      return { success: response.data.success, message: response.data.message };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Get the authenticated user's profile.
   * GET /auth/me
   */
  async getProfile(): Promise<AuthResponse> {
    try {
      const token = await getToken();
      if (!token) {
        return { success: false, message: 'No token found. User may not be logged in.' };
      }

      const response = await api.get<BackendLoginResponse>('auth/me');

      if (!response.data.success || !response.data.data) {
        return { success: false, message: response.data.message || 'Failed to fetch profile' };
      }

      const data = response.data.data as Record<string, unknown>;
      const user = (data?.user ?? data) as AuthResponse['user'];
      return { success: true, user };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Change the authenticated user's password.
   * PUT /auth/change-password
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    _confirmPassword: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.put<{ success: boolean; message: string }>(
        '/auth/change-password',
        { currentPassword, newPassword }
      );
      return { success: response.data.success, message: response.data.message };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },

  /**
   * Confirm MDCN license verification for the authenticated professional.
   * PATCH /auth/mdcn-verify
   */
  async confirmMdcnVerification(): Promise<{ success: boolean; message: string; user?: import('../types/auth-types').User }> {
    try {
      const response = await api.patch<{ success: boolean; message: string; data?: { user: import('../types/auth-types').User } }>(
        '/auth/mdcn-verify'
      );
      if (!response.data.success) {
        return { success: false, message: response.data.message || 'MDCN verification failed' };
      }
      return { success: true, message: response.data.message, user: response.data.data?.user };
    } catch (error: unknown) {
      return { success: false, message: extractErrorMessage(error) };
    }
  },
};
