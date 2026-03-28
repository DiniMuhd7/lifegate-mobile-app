/**
 * Unit tests for tokenStorage.ts
 *
 * Covers:
 *  - saveToken / getToken / removeToken with SecureStore available
 *  - Fallback to AsyncStorage when SecureStore throws at the native layer
 *  - isTokenValid returns true/false correctly
 *
 * The module uses a cached probe (probeSecureStore) to detect whether the
 * native SecureStore implementation works. We simulate:
 *   - "available": setItemAsync resolves normally
 *   - "unavailable": setItemAsync throws (mimics old Expo Go native error)
 *
 * jest.resetModules() in beforeEach resets the probe cache each test.
 */

// ─── Shared mock state ────────────────────────────────────────────────────────

// SecureStore mock — functions are re-assigned per suite in beforeEach blocks.
const mockSetItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

const mockAsyncStorage = {
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
};

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'lifegate_token';

beforeEach(() => {
  // Reset module registry → resets the cached `secureStoreWorks` in tokenStorage.
  jest.resetModules();
  // Default: SecureStore probe passes (setItemAsync + deleteItemAsync resolve).
  mockSetItemAsync.mockReset().mockResolvedValue(undefined);
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
  // AsyncStorage
  mockAsyncStorage.setItem.mockReset().mockResolvedValue(undefined);
  mockAsyncStorage.getItem.mockReset().mockResolvedValue(null);
  mockAsyncStorage.removeItem.mockReset().mockResolvedValue(undefined);
});

// Helper: re-require tokenStorage after modules are reset.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const requireModule = () => require('../utils/tokenStorage') as typeof import('../utils/tokenStorage');

// ─── Tests: SecureStore available ─────────────────────────────────────────────
// The probe calls setItemAsync('__probe__','1') then deleteItemAsync('__probe__').
// After that, real saveToken/getToken/etc calls follow.

describe('tokenStorage — SecureStore available', () => {
  it('saveToken calls SecureStore.setItemAsync', async () => {
    const { saveToken } = requireModule();
    await saveToken('my-jwt-token');
    // First two calls are the probe (set + delete __probe__), third is saveToken.
    expect(mockSetItemAsync).toHaveBeenLastCalledWith(TOKEN_KEY, 'my-jwt-token');
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('getToken calls SecureStore.getItemAsync and returns value', async () => {
    // Probe uses setItemAsync/deleteItemAsync; getItemAsync is only called by getToken.
    mockGetItemAsync.mockResolvedValue('stored-token');
    const { getToken } = requireModule();
    const token = await getToken();
    expect(token).toBe('stored-token');
    expect(mockGetItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
  });

  it('getToken returns null when no token stored', async () => {
    const { getToken } = requireModule();
    const token = await getToken();
    expect(token).toBeNull();
  });

  it('removeToken calls SecureStore.deleteItemAsync', async () => {
    const { removeToken } = requireModule();
    await removeToken();
    // Probe calls deleteItemAsync('__probe__'), then removeToken calls deleteItemAsync(TOKEN_KEY).
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('isTokenValid returns true when token exists', async () => {
    mockGetItemAsync.mockResolvedValue('valid-token');
    const { isTokenValid } = requireModule();
    expect(await isTokenValid()).toBe(true);
  });

  it('isTokenValid returns false when no token', async () => {
    const { isTokenValid } = requireModule();
    expect(await isTokenValid()).toBe(false);
  });
});

// ─── Tests: SecureStore NOT available (fallback) ──────────────────────────────
// Simulate the real Expo Go failure: setItemAsync IS a function but throws at runtime.

describe('tokenStorage — AsyncStorage fallback (SecureStore throws)', () => {
  beforeEach(() => {
    // Probe will call setItemAsync and it will throw → probe returns false → fallback.
    mockSetItemAsync.mockReset().mockRejectedValue(
      new Error('ExpoSecureStore.default.setValueWithKeyAsync is not a function')
    );
  });

  it('saveToken falls back to AsyncStorage.setItem', async () => {
    const { saveToken } = requireModule();
    await saveToken('fallback-token');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(TOKEN_KEY, 'fallback-token');
    // setItemAsync was only called once (for the probe), not for the real save.
    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
  });

  it('getToken falls back to AsyncStorage.getItem', async () => {
    mockAsyncStorage.getItem.mockResolvedValue('async-token');
    const { getToken } = requireModule();
    const token = await getToken();
    expect(token).toBe('async-token');
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(TOKEN_KEY);
  });

  it('removeToken falls back to AsyncStorage.removeItem', async () => {
    const { removeToken } = requireModule();
    await removeToken();
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEY);
  });

  it('isTokenValid returns false when AsyncStorage has no token', async () => {
    const { isTokenValid } = requireModule();
    expect(await isTokenValid()).toBe(false);
  });
});
