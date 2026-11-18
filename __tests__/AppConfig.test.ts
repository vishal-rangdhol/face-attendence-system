import { describe, expect, it, beforeEach, beforeAll, mock } from 'bun:test';

const mockStorage = new Map<string, string>();
mock.module('expo-secure-store', () => ({
  getItemAsync: mock((key: string) => Promise.resolve(mockStorage.get(key) || null)),
  setItemAsync: mock((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: mock((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

mock.module('react-native', () => ({
  Platform: { OS: 'ios' },
}));

let resolveApiBaseUrl: any;
let resolveAuthToken: any;
let SecureStoreKeychainManager: any;

describe('App Runtime Configuration & Environment Discovery', () => {
  const originalEnv = process.env;

  beforeAll(async () => {
    const configMod = await import('../src/modules/biometric/services/AppConfig');
    resolveApiBaseUrl = configMod.resolveApiBaseUrl;
    resolveAuthToken = configMod.resolveAuthToken;

    const keychainMod = await import('../src/modules/biometric/services/SecureStoreKeychainManager');
    SecureStoreKeychainManager = keychainMod.SecureStoreKeychainManager;
  });

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN;
    mockStorage.clear();
    await SecureStoreKeychainManager.clearAuthToken();
  });

  it('respects EXPO_PUBLIC_API_URL environment variable override', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.custom.school.edu';
    expect(resolveApiBaseUrl()).toBe('https://api.custom.school.edu');
  });

  it('falls back to default localhost:4500 when no custom env or device is present', () => {
    const url = resolveApiBaseUrl();
    expect(url).toMatch(/http:\/\/(localhost|10\.0\.2\.2):4500/);
  });

  it('resolves hardware keystore auth token when present', async () => {
    await SecureStoreKeychainManager.saveAuthToken('jwt-hardware-test-token-777');
    const token = await resolveAuthToken();
    expect(token).toBe('jwt-hardware-test-token-777');
  });

  it('falls back to EXPO_PUBLIC_DEV_AUTH_TOKEN when keystore is empty', async () => {
    process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN = 'jwt-env-dev-token-999';
    const token = await resolveAuthToken();
    expect(token).toBe('jwt-env-dev-token-999');
  });

  it('falls back to deterministic local dev token when no token configured (prevents test breakage)', async () => {
    const token = await resolveAuthToken();
    expect(token).toBe('dev-biometric-jwt-token-local');
  });
});
