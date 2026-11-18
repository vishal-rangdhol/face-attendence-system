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
}));

import type { CheckinInput } from '../src/modules/biometric/types';

let OfflinePunchQueue: any;

describe('OfflinePunchQueue (Offline Storage & Forward)', () => {
  beforeAll(async () => {
    const mod = await import('../src/modules/biometric/services/OfflinePunchQueue');
    OfflinePunchQueue = mod.OfflinePunchQueue;
  });

  beforeEach(async () => {
    mockStorage.clear();
    await OfflinePunchQueue.clear();
  });

  const mockPayload: CheckinInput = {
    event_type: 'CHECK_IN',
    verified: true,
    confidence: 0.94,
    device_id: 'dfp_mock_123',
    timestamp_client: new Date().toISOString(),
  };

  it('queues punch when offline and persists in FIFO order', async () => {
    const item1 = await OfflinePunchQueue.enqueue(mockPayload);
    const item2 = await OfflinePunchQueue.enqueue({
      ...mockPayload,
      event_type: 'CHECK_OUT',
    });

    const queue = await OfflinePunchQueue.getAll();
    expect(queue.length).toBe(2);
    expect(queue[0].id).toBe(item1.id);
    expect(queue[0].payload.event_type).toBe('CHECK_IN');
    expect(queue[1].id).toBe(item2.id);
    expect(queue[1].payload.event_type).toBe('CHECK_OUT');
  });

  it('flushes queued punches successfully when API client reports success', async () => {
    await OfflinePunchQueue.enqueue(mockPayload);

    const mockApiClient: any = {
      checkin: () =>
        Promise.resolve({
          success: true,
          status: 'RECORDED',
          log_id: 'log_mock_synced',
          flags: [],
        }),
    };

    const flushResult = await OfflinePunchQueue.flush(mockApiClient);
    expect(flushResult.synced).toBe(1);
    expect(flushResult.failed).toBe(0);

    const remaining = await OfflinePunchQueue.getAll();
    expect(remaining.length).toBe(0);
  });

  it('preserves failed punch in queue for retry when API client throws error', async () => {
    await OfflinePunchQueue.enqueue(mockPayload);

    const mockFailingApiClient: any = {
      checkin: () => Promise.reject(new Error('Network request failed')),
    };

    const flushResult = await OfflinePunchQueue.flush(mockFailingApiClient);
    expect(flushResult.synced).toBe(0);
    expect(flushResult.failed).toBe(1);

    const remaining = await OfflinePunchQueue.getAll();
    expect(remaining.length).toBe(1);
    expect(remaining[0].retry_count).toBe(1);
  });

  it('treats 409 DUPLICATE_PUNCH as synced and drains it from the queue', async () => {
    await OfflinePunchQueue.enqueue(mockPayload);

    const mockDuplicateApiClient: any = {
      checkin: () => {
        const err: any = new Error('Punch already recorded for this window');
        err.status = 409;
        err.code = 'DUPLICATE_PUNCH';
        return Promise.reject(err);
      },
    };

    const flushResult = await OfflinePunchQueue.flush(mockDuplicateApiClient);
    expect(flushResult.synced).toBe(1);
    expect(flushResult.failed).toBe(0);

    const remaining = await OfflinePunchQueue.getAll();
    expect(remaining.length).toBe(0);
  });
});
