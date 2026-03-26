import api from './api';
import { saveToken, getToken } from '../utils/tokenStorage';
import { extractErrorMessage } from '../utils/error-utils';
import {
  BackendLoginResponse,
  LoginPayload,
  RegisterPayload,
  AuthResponse,
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
      await saveToken(token);
      // Save token to secure storage
      console.log('Login successful:');

      return {
        success: true,
        user,
        token,
      };
    } catch (error: any) {
      const message = extractErrorMessage(error);
      // console.error('Login error:', message.message);
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * Register new user with unified payload
   * Calls POST /auth/register
   * Saves token to secure storage
   * Returns user data
   *
   * Works for both regular users and health professionals
   * Role is explicitly set in the payload
   */
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      console.log('Sending registration request to backend...', payload);

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
      console.error('Registration error:', error);
      const message = extractErrorMessage(error);
      console.log('extracted message: ', message);
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * NEW TWO-STAGE REGISTRATION FLOW
   * Stage 1: Submit registration details and receive OTP
   * POST /api/auth/register/start
   * Accepts FormData for multipart/form-data requests (supports file uploads)
   */
async startRegistration(
  payload: FormData | RegistrationStartPayload
): Promise<RegistrationStartResponse> {
  try {
    const isFormData = payload instanceof FormData;
    console.log('Starting registration with', isFormData ? 'FormData' : 'object payload');
    console.log('Payload content:', payload);

    const { data } = await api.post<RegistrationStartResponse>(
      '/auth/register/start',
      payload,
      isFormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } } // critical in RN
        : undefined
    );

    if (!data.success) {
      console.log('Registration start failed:', data.message);
    }

    return data;
  } catch (error: any) {
    console.error('Start registration error:', error);

    return {
      success: false,
      message: extractErrorMessage(error),
    };
  }
},

  /**
   * NEW TWO-STAGE REGISTRATION FLOW
   * Stage 2: Verify OTP and complete registration
   * POST /api/auth/register/verify
   * Returns JWT token and user data
   */
  async verifyRegistration(
    payload: RegistrationVerifyPayload
  ): Promise<RegistrationVerifyResponse> {
    try {
      console.log('Verifying registration with email:', payload.email);

      const response = await api.post<RegistrationVerifyResponse>('/auth/register/verify', payload);

      if (!response.data.success || !response.data.data) {
        console.log('Registration verification failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Verification failed',
        };
      }

      const { token, user } = response.data.data;

      // Save token to secure storage
      await saveToken(token);

      console.log('Registration verified - user logged in, token saved');

      return {
        success: true,
        message: response.data.message,
        data: { token, user },
      };
    } catch (error: any) {
      console.error('Verify registration error:', error);
      const message = extractErrorMessage(error);
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * NEW TWO-STAGE REGISTRATION FLOW
   * Resend OTP during registration verification
   * POST /api/auth/register/resend
   */
  async resendRegistrationOTP(email: string): Promise<RegistrationResendResponse> {
    try {
      console.log('Resending registration OTP to:', email);

      const response = await api.post<RegistrationResendResponse>('/auth/register/resend', {
        email,
      });

      if (!response.data.success) {
        console.log('Resend OTP failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Failed to resend code',
        };
      }

      console.log('OTP resent successfully');

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error: any) {
      console.error('Resend registration OTP error:', error);
      const message = extractErrorMessage(error);
      return {
        success: false,
        message,
      };
    }
  },

  /**
   * Send OTP for password recovery
   * TODO: Call POST /auth/forgot-password/send-otp when backend is ready
   */
  async sendOtpForPasswordRecovery(email: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Sending OTP for password recovery to:', email);

      // TODO: Implement actual API call when backend is ready
      const response = await api.post('/auth/password/send-reset-code', { email });
      return { success: response.data.success, message: response.data.message };

      // // Placeholder: Simulate success
      // return {
      //   success: true,
      //   message: 'OTP sent successfully',
      // };
    } catch (error: any) {
      console.error('Send OTP error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },

  /**
   * Verify reset code for password recovery
   * Now accepts 6-digit code and returns resetToken
   * POST /auth/password/verify-reset-code
   */
  async verifyOtpForPasswordRecovery(
    email: string,
    code: string
  ): Promise<VerifyResetCodeResponse> {
    try {
      console.log('Verifying reset code for password recovery:', { email, code });

      const response = await api.post<VerifyResetCodeResponse>('/auth/password/verify-reset-code', {
        email,
        code,
      });

      if (!response.data.success) {
        console.log('Reset code verification failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Verification failed',
          data: { resetToken: '' },
        };
      }

      console.log('Reset code verified successfully');
      return response.data;
    } catch (error: any) {
      console.error('Verify reset code error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
        data: { resetToken: '' },
      };
    }
  },

  /**
   * Reset password with verified reset token
   * POST /auth/password/reset-password
   */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<ResetPasswordResponse> {
    try {
      console.log('Resetting password with token');

      const response = await api.post<ResetPasswordResponse>('/auth/password/reset', {
        token,
        newPassword,
      });

      if (!response.data.success) {
        console.log('Password reset failed:', response.data.message);
        return {
          success: false,
          message: response.data.message || 'Password reset failed',
        };
      }

      console.log('Password reset successfully');
      return response.data;
    } catch (error: any) {
      console.error('Reset password error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },

  /**
   * Send OTP during signup for email verification
   * TODO: Call POST /auth/signup/send-otp when backend is ready
   */
  async sendOtpForSignup(email: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Sending OTP for signup to:', email);

      // TODO: Implement actual API call when backend is ready
      // const response = await api.post('/auth/signup/send-otp', { email });
      // return { success: response.data.success, message: response.data.message };

      // Placeholder: Simulate success
      return {
        success: true,
        message: 'Verification code sent',
      };
    } catch (error: any) {
      console.error('Send signup OTP error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },

  /**
   * Verify OTP during signup
   * TODO: Call POST /auth/signup/verify-otp when backend is ready
   */
  async verifyOtpForSignup(
    email: string,
    otp: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Verifying OTP for signup:', { email, otp });

      // TODO: Implement actual API call when backend is ready
      // const response = await api.post('/auth/signup/verify-otp', { email, otp });
      // return { success: response.data.success, message: response.data.message };

      // Placeholder: Simulate success
      return {
        success: true,
        message: 'Email verified successfully',
      };
    } catch (error: any) {
      console.error('Verify signup OTP error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },

  /**
   * Resend OTP (both password reset and signup)
   * TODO: Call POST /auth/otp/resend when backend is ready
   */
  async resendOtp(
    email: string,
    type: 'password-reset' | 'signup'
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`Resending OTP for ${type} to:`, email);

      // TODO: Implement actual API call when backend is ready
      // const response = await api.post('/auth/otp/resend', { email, type });
      // return { success: response.data.success, message: response.data.message };

      // Placeholder: Simulate success
      return {
        success: true,
        message: 'Code resent successfully',
      };
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },

  /**
   * Get user profile
   * Calls GET /me
   * Returns user profile data
   */
 async getProfile(): Promise<AuthResponse> {
  try {
    console.log('Fetching user profile...');
    
    // Get token from storage
    const token = await getToken();
    if (!token) {
      return {
        success: false,
        message: 'No token found. User may not be logged in.',
      };
    }

    // Attach Authorization header manually
    const response = await api.get<BackendLoginResponse>('auth/me');

    if (!response.data.success || !response.data.data) {
      console.log('Failed to fetch profile:', response.data.message);
      return {
        success: false,
        message: response.data.message || 'Failed to fetch profile',
      };
    }

    console.log('Profile fetched successfully');
    const user = response.data.data;
    console.log('User profile:', user);

    return {
      success: true,
      user: user,
    };
  } catch (error: any) {
    console.error('Get profile error:', extractErrorMessage(error));
    return {
      success: false,
      message: extractErrorMessage(error),
    };
  }
},


  /**
   * Change user password
   * Calls POST /auth/change-password
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Changing password...');
      // TODO: Implement actual API call when backend is ready
      // const response = await api.post('/auth/change-password', {
      //   currentPassword,
      //   newPassword,
      //   confirmPassword,
      // });
      // return { success: response.data.success, message: response.data.message };
      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error: any) {
      console.error('Change password error:', error);
      return {
        success: false,
        message: extractErrorMessage(error),
      };
    }
  },
};
