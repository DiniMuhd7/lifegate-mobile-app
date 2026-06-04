/**
 * Unit tests for auth-service.ts
 *
 * Covers:
 *  - login() success path
 *  - login() failure (backend returns success:false)
 *  - login() network error handling
 *  - login() does NOT call saveToken (store's responsibility)
 *  - register() calls saveToken on success
 *  - verifyRegistration() calls saveToken on success
 *  - sendOtpForPasswordRecovery() happy path
 *  - resendOtp() routes to correct method
 *
 * Uses inline jest.fn() in mock factories (no external variable references)
 * to avoid jest-hoist timing issues. Mock references are obtained from
 * imported modules after mocks are applied.
 */

// ─── Mocks (registered before any module is loaded) ──────────────────────────

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('../utils/tokenStorage', () => ({
  saveToken: jest.fn().mockResolvedValue(undefined),
  getToken: jest.fn().mockResolvedValue(null),
  removeToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/error-utils', () => ({
  extractErrorMessage: (err: unknown): string => {
    if (err instanceof Error) return err.message;
    return 'An error occurred. Please try again.';
  },
}));

// ─── Static imports (get mocked versions) ────────────────────────────────────

import { AuthService } from '../services/auth-service';
import api from '../services/api';
import { saveToken } from '../utils/tokenStorage';

// Cast mocked module methods for easy use in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPost = (api as any).post as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPut = (api as any).put as jest.Mock;
const mockSaveToken = saveToken as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'USR-abc123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
};

const makeSuccessResponse = (data: unknown) => ({
  data: { success: true, message: 'OK', data },
});

const makeFailResponse = (message: string) => ({
  data: { success: false, message },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveToken.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService.login()', () => {
  it('returns success with user and token on valid credentials', async () => {
    const token = 'jwt-token-abc';
    mockPost.mockResolvedValue(makeSuccessResponse({ token, user: mockUser }));

    const result = await AuthService.login({ email: 'test@example.com', password: 'Pass@123' });

    expect(result.success).toBe(true);
    expect(result.user).toEqual(mockUser);
    expect(result.token).toBe(token);
  });

  it('does NOT call saveToken (store is responsible for persistence)', async () => {
    mockPost.mockResolvedValue(makeSuccessResponse({ token: 'jwt', user: mockUser }));

    await AuthService.login({ email: 'test@example.com', password: 'Pass@123' });

    expect(mockSaveToken).not.toHaveBeenCalled();
  });

  it('returns failure when backend returns success:false', async () => {
    mockPost.mockResolvedValue(makeFailResponse('invalid credentials'));

    const result = await AuthService.login({ email: 'test@example.com', password: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('invalid credentials');
    expect(result.user).toBeUndefined();
  });

  it('returns generic message when backend gives no message on failure', async () => {
    mockPost.mockResolvedValue({ data: { success: false } });

    const result = await AuthService.login({ email: 'x@x.com', password: 'y' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Login failed');
  });

  it('handles network error gracefully', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));

    const result = await AuthService.login({ email: 'test@example.com', password: 'Pass@123' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Network Error');
  });
});

describe('AuthService.register()', () => {
  it('saves token and returns user on success', async () => {
    const token = 'reg-token';
    mockPost.mockResolvedValue(makeSuccessResponse({ token, user: mockUser }));

    const result = await AuthService.register({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Pass@123',
      role: 'user',
    });

    expect(result.success).toBe(true);
    expect(result.user).toEqual(mockUser);
    expect(mockSaveToken).toHaveBeenCalledWith(token);
  });

  it('returns failure when backend returns success:false', async () => {
    mockPost.mockResolvedValue(makeFailResponse('Email already exists'));

    const result = await AuthService.register({
      name: 'Test',
      email: 'taken@example.com',
      password: 'Pass@123',
      role: 'user',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Email already exists');
    expect(mockSaveToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.verifyRegistration()', () => {
  it('saves token and returns user on success', async () => {
    const token = 'verify-token';
    mockPost.mockResolvedValue(makeSuccessResponse({ token, user: mockUser }));

    const result = await AuthService.verifyRegistration({ email: 'test@example.com', otp: '123456' });

    expect(result.success).toBe(true);
    expect(result.data?.token).toBe(token);
    expect(mockSaveToken).toHaveBeenCalledWith(token);
  });

  it('returns failure on wrong OTP', async () => {
    mockPost.mockResolvedValue(makeFailResponse('Invalid OTP'));

    const result = await AuthService.verifyRegistration({ email: 'test@example.com', otp: '000000' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid OTP');
    expect(mockSaveToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.sendOtpForPasswordRecovery()', () => {
  it('returns success from backend', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'Code sent' } });

    const result = await AuthService.sendOtpForPasswordRecovery('test@example.com');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Code sent');
    expect(mockPost).toHaveBeenCalledWith('/auth/password/send-reset-code', { email: 'test@example.com' });
  });

  it('handles error gracefully', async () => {
    mockPost.mockRejectedValue(new Error('timeout'));

    const result = await AuthService.sendOtpForPasswordRecovery('test@example.com');

    expect(result.success).toBe(false);
    expect(result.message).toBe('timeout');
  });
});

describe('AuthService.resendOtp()', () => {
  it('routes signup type to resendRegistrationOTP', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'Resent' } });

    const result = await AuthService.resendOtp('test@example.com', 'signup');

    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/auth/register/resend', { email: 'test@example.com' });
  });

  it('routes password-reset type to send-reset-code endpoint', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'Reset code sent' } });
    const result = await AuthService.resendOtp('test@example.com', 'password-reset');
    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/auth/password/send-reset-code', { email: 'test@example.com' });
  });
});

describe('AuthService.changePassword()', () => {
  it('returns success from backend', async () => {
    mockPut.mockResolvedValue({ data: { success: true, message: 'Password changed' } });

    const result = await AuthService.changePassword('OldPass@1', 'NewPass@1', 'NewPass@1');

    expect(result.success).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'OldPass@1',
      newPassword: 'NewPass@1',
    });
  });

  it('returns failure when current password is wrong', async () => {
    mockPut.mockResolvedValue({ data: { success: false, message: 'current password is incorrect' } });

    const result = await AuthService.changePassword('wrong', 'NewPass@1', 'NewPass@1');

    expect(result.success).toBe(false);
    expect(result.message).toBe('current password is incorrect');
  });
});
