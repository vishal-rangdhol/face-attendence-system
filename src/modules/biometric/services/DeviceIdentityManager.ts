import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * DeviceIdentityManager
 *
 * Generates and securely persists a unique SHA-256 device identifier
 * used for Gate 3 (Device Binding) and vector download rate-limiting.
 */
export class DeviceIdentityManager {
  private static readonly DEVICE_ID_KEY = 'lcu_biometric_device_id';
  private static cachedDeviceId: string | null = null;

  public static async getDeviceId(): Promise<string> {
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    try {
      let storedId = await SecureStore.getItemAsync(this.DEVICE_ID_KEY);
      if (!storedId) {
        const randomSeed = `${Date.now()}-${Math.random()}-${Math.random()}`;
        storedId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          randomSeed
        );
        await SecureStore.setItemAsync(this.DEVICE_ID_KEY, storedId);
      }
      this.cachedDeviceId = storedId;
      return storedId;
    } catch {
      // Fallback for mock/test environments
      const fallbackId = 'dfp_mock_device_uuid_sha256';
      this.cachedDeviceId = fallbackId;
      return fallbackId;
    }
  }

  public static setMockDeviceId(id: string): void {
    this.cachedDeviceId = id;
  }
}
