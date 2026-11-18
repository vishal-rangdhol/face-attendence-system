import * as SecureStore from 'expo-secure-store';
import type { CheckinInput, QueuedOfflinePunch } from '../types';
import type { BiometricApiClient } from './BiometricApiClient';

/**
 * OfflinePunchQueue
 *
 * Implements store-and-forward queueing for biometric punches captured when
 * mobile signal is absent or degraded at school gates.
 */
export class OfflinePunchQueue {
  private static readonly QUEUE_KEY = 'lcu_offline_punch_queue_v1';
  private static inMemoryQueue: QueuedOfflinePunch[] = [];

  public static async enqueue(payload: CheckinInput): Promise<QueuedOfflinePunch> {
    const item: QueuedOfflinePunch = {
      id: `punch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      payload,
      queued_at: new Date().toISOString(),
      retry_count: 0,
    };

    const queue = await this.getAll();
    queue.push(item);
    await this.saveQueue(queue);
    return item;
  }

  public static async getAll(): Promise<QueuedOfflinePunch[]> {
    try {
      const serialized = await SecureStore.getItemAsync(this.QUEUE_KEY);
      if (serialized) {
        return JSON.parse(serialized) as QueuedOfflinePunch[];
      }
      return [...this.inMemoryQueue];
    } catch {
      return [...this.inMemoryQueue];
    }
  }

  private static async saveQueue(queue: QueuedOfflinePunch[]): Promise<void> {
    this.inMemoryQueue = [...queue];
    try {
      await SecureStore.setItemAsync(this.QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // In-memory queue acts as fallback
    }
  }

  public static async clear(): Promise<void> {
    this.inMemoryQueue = [];
    try {
      await SecureStore.deleteItemAsync(this.QUEUE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Flushes queued punches to the backend API.
   */
  public static async flush(apiClient: BiometricApiClient): Promise<{
    synced: number;
    failed: number;
  }> {
    const queue = await this.getAll();
    if (queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    const remaining: QueuedOfflinePunch[] = [];
    let synced = 0;
    let failed = 0;
    let networkDead = false;

    for (const item of queue) {
      if (networkDead) {
        remaining.push(item);
        failed++;
        continue;
      }

      if (item.retry_count >= 5) {
        failed++;
        continue;
      }

      try {
        const result = await apiClient.checkin(item.payload);
        if (result.success) {
          synced++;
        } else {
          item.retry_count++;
          remaining.push(item);
          failed++;
        }
      } catch (err: any) {
        if (err?.status === 409 || err?.code === 'DUPLICATE_PUNCH') {
          // Server already recorded this punch (e.g. earlier timeout/retry). Treat as synced to avoid retry loop.
          synced++;
        } else {
          item.retry_count++;
          remaining.push(item);
          failed++;

          // Stop hammering the network if connectivity dropped or timed out
          const errMsg = String(err?.message || '');
          if (
            err?.name === 'AbortError' ||
            errMsg.includes('fetch failed') ||
            errMsg.includes('Network request failed') ||
            errMsg.includes('canceled')
          ) {
            networkDead = true;
          }
        }
      }
    }

    await this.saveQueue(remaining);
    return { synced, failed };
  }
}
