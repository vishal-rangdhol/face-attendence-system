import * as SecureStore from 'expo-secure-store';
import type { StoredBaselineVectors } from '../types';

/**
 * SecureStoreKeychainManager
 *
 * Encapsulates hardware-backed secure storage of baseline face vectors
 * via iOS Keychain / Android Keystore.
 */
export class SecureStoreKeychainManager {
  private static readonly VECTORS_KEY = 'lcu_teacher_baseline_vectors_v1';
  private static readonly AUTH_TOKEN_KEY = 'lcu_auth_jwt_token_v1';
  private static readonly USER_INFO_KEY = 'lcu_auth_user_info_v1';
  private static inMemoryFallback: StoredBaselineVectors | null = null;
  private static inMemoryTokenFallback: string | null = null;
  private static inMemoryUserFallback: { name?: string; email?: string; campusId?: string } | null = null;

  public static async saveBaselineVectors(vectors: StoredBaselineVectors): Promise<void> {
    try {
      const serialized = JSON.stringify(vectors);
      await SecureStore.setItemAsync(this.VECTORS_KEY, serialized, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      this.inMemoryFallback = vectors;
    } catch {
      this.inMemoryFallback = vectors;
    }
  }

  public static async getBaselineVectors(): Promise<StoredBaselineVectors | null> {
    try {
      const serialized = await SecureStore.getItemAsync(this.VECTORS_KEY);
      if (serialized) {
        return JSON.parse(serialized) as StoredBaselineVectors;
      }
      return this.inMemoryFallback;
    } catch {
      return this.inMemoryFallback;
    }
  }

  public static async clearBaselineVectors(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.VECTORS_KEY);
    } catch {
      // Ignore deletion failure
    }
    this.inMemoryFallback = null;
  }

  public static async saveAuthToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.AUTH_TOKEN_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      this.inMemoryTokenFallback = token;
    } catch {
      this.inMemoryTokenFallback = token;
    }
  }

  public static async getAuthToken(): Promise<string | null> {
    try {
      const token = await SecureStore.getItemAsync(this.AUTH_TOKEN_KEY);
      if (token) {
        return token;
      }
      return this.inMemoryTokenFallback;
    } catch {
      return this.inMemoryTokenFallback;
    }
  }

  public static async clearAuthToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.AUTH_TOKEN_KEY);
    } catch {
      // Ignore deletion failure
    }
    this.inMemoryTokenFallback = null;
  }

  public static async saveUserInfo(info: { name?: string; email?: string; campusId?: string }): Promise<void> {
    try {
      const serialized = JSON.stringify(info);
      await SecureStore.setItemAsync(this.USER_INFO_KEY, serialized, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      this.inMemoryUserFallback = info;
    } catch {
      this.inMemoryUserFallback = info;
    }
  }

  public static async getUserInfo(): Promise<{ name?: string; email?: string; campusId?: string } | null> {
    try {
      const serialized = await SecureStore.getItemAsync(this.USER_INFO_KEY);
      if (serialized) {
        return JSON.parse(serialized);
      }
      return this.inMemoryUserFallback;
    } catch {
      return this.inMemoryUserFallback;
    }
  }

  public static async clearUserInfo(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.USER_INFO_KEY);
    } catch {
      // Ignore deletion failure
    }
    this.inMemoryUserFallback = null;
  }
}
