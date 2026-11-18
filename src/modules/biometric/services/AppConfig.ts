import { Platform } from 'react-native';
import { SecureStoreKeychainManager } from './SecureStoreKeychainManager';

/**
 * Resolves the appropriate backend API base URL depending on runtime environment:
 * - Environment variable override (EXPO_PUBLIC_API_URL)
 * - Expo Go / Dev Client on physical LAN device (auto-discovers Metro host IP)
 * - Android Emulator loopback bridge (10.0.2.2:4500)
 * - iOS Simulator / Web / localhost fallback (localhost:4500)
 */
export function resolveApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Attempt dynamic discovery from Expo Constants when running on physical device
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants')?.default || require('expo-constants');
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoClient?.hostUri ||
      Constants?.manifest?.debuggerHost;

    if (hostUri && typeof hostUri === 'string') {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:4500`;
      }
    }

    // Physical Android devices cannot use 10.0.2.2 loopback; route to LAN IP
    if (Constants?.isDevice && Platform && Platform.OS === 'android') {
      return 'http://192.168.0.5:4500';
    }
  } catch {
    // expo-constants optional fallback
  }

  // Android emulator loopback alias
  if (Platform && Platform.OS === 'android') {
    return 'http://10.0.2.2:4500';
  }

  // iOS Simulator / Web / Local development fallback
  return 'http://localhost:4500';
}

/**
 * Provides an active JWT authentication token:
 * 1. Checks hardware-backed Keystore/Keychain via SecureStoreKeychainManager
 * 2. Checks EXPO_PUBLIC_DEV_AUTH_TOKEN environment variable
 * 3. Falls back to a deterministic development JWT token during local testing
 */
export async function resolveAuthToken(): Promise<string> {
  const storedToken = await SecureStoreKeychainManager.getAuthToken();
  if (storedToken && storedToken.trim()) {
    return storedToken.trim();
  }

  if (process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN) {
    return process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN.trim();
  }

  // Deterministic dev token for local testing on emulators and web in development
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  if (isDev) {
    return 'dev-biometric-jwt-token-local';
  }

  return '';
}
