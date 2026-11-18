import { describe, expect, it } from 'bun:test';
import { BiometricApiClient } from '../src/modules/biometric/services/BiometricApiClient';

describe('BiometricApiClient (Mobile to KCS-Backend Contract)', () => {
  it('calls POST /api/v1/attendance/checkin with verified payload', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;
    let capturedHeaders: any = null;

    const mockFetch: any = (url: string, options: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      capturedHeaders = options.headers;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'RECORDED',
            log_id: 'log_mock_999',
            flags: ['NONE'],
          }),
      });
    };

    const client = new BiometricApiClient('http://localhost:4500', () => 'jwt_mock_token', mockFetch);

    const result = await client.checkin({
      event_type: 'CHECK_IN',
      verified: true,
      confidence: 0.94,
      gps_lat: 17.4485,
      gps_lng: 78.3742,
      device_id: 'dfp_device_sha256',
      timestamp_client: '2026-11-17T08:30:00.000Z',
    });

    expect(capturedUrl).toBe('http://localhost:4500/api/v1/attendance/checkin');
    expect(capturedHeaders['Authorization']).toBe('Bearer jwt_mock_token');
    expect(capturedBody.event_type).toBe('CHECK_IN');
    expect(capturedBody.verified).toBe(true);
    expect(capturedBody.confidence).toBe(0.94);
    expect(result.status).toBe('RECORDED');
    expect(result.log_id).toBe('log_mock_999');
  });

  it('calls GET /api/v1/biometric/vectors with X-Device-Fingerprint header', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = null;

    const mockFetch: any = (url: string, options: any) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              encrypted_vectors: {
                alg: 'AEAD_AES_256_CBC_HMAC_SHA_512',
                kid: 'k1',
                iv: 'iv',
                ciphertext: 'ct',
                sig: 'sig',
              },
            },
          }),
      });
    };

    const client = new BiometricApiClient('http://localhost:4500', () => 'jwt_mock_token', mockFetch);
    const result = await client.getVectors('dfp_new_device_fingerprint');

    expect(capturedUrl).toBe('http://localhost:4500/api/v1/biometric/vectors');
    expect(capturedHeaders['X-Device-Fingerprint']).toBe('dfp_new_device_fingerprint');
    expect(result.data.encrypted_vectors.alg).toBe('AEAD_AES_256_CBC_HMAC_SHA_512');
  });

  it('downloads decrypted vector arrays for phone-switch hardware keystore restore', async () => {
    const mockVector = new Array(128).fill(0.088);
    const mockFetch: any = () => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              encrypted_vectors: {
                alg: 'AEAD_AES_256_CBC_HMAC_SHA_512',
                kid: 'k1',
                iv: 'iv',
                ciphertext: 'ct',
                sig: 'sig',
              },
              vectors: {
                vector_center: mockVector,
                vector_left: mockVector,
                vector_right: mockVector,
              },
            },
          }),
      });
    };

    const client = new BiometricApiClient('http://localhost:4500', () => 'jwt_mock_token', mockFetch);
    const result = await client.getVectors('dfp_pixel9_switch');

    expect(result.data.vectors).toBeDefined();
    expect(result.data.vectors?.vector_center.length).toBe(128);
    expect(result.data.vectors?.vector_left.length).toBe(128);
    expect(result.data.vectors?.vector_right.length).toBe(128);
  });

  it('throws ApiHttpError with status and code when server returns HTTP 403', async () => {
    const mockFetch: any = () => {
      return Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            success: false,
            error: {
              code: 'UNREGISTERED_DEVICE',
              message: 'Attendance attempted from an unregistered device',
            },
          }),
      });
    };

    const client = new BiometricApiClient('http://localhost:4500', () => 'jwt_mock_token', mockFetch);

    try {
      await client.checkin({
        event_type: 'CHECK_IN',
        verified: true,
        confidence: 0.94,
        device_id: 'dfp_unregistered',
        timestamp_client: '2026-11-17T08:30:00.000Z',
      });
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.name).toBe('ApiHttpError');
      expect(err.status).toBe(403);
      expect(err.code).toBe('UNREGISTERED_DEVICE');
      expect(err.message).toContain('unregistered device');
    }
  });

  it('calls POST /api/v1/biometric/revoke to exercise DPDP Act consent revocation', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any = null;

    const mockFetch: any = (url: string, options: any) => {
      capturedUrl = url;
      capturedMethod = options.method;
      capturedBody = JSON.parse(options.body);
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            message: 'Biometric consent successfully revoked and vector data purged',
            data: {
              status: 'REVOKED',
              revoked_at: '2026-11-17T23:30:00.000Z',
            },
          }),
      });
    };

    const client = new BiometricApiClient('http://localhost:4500', () => 'jwt_mock_token', mockFetch);
    const result = await client.revokeConsent('User requested erasure');

    expect(capturedUrl).toBe('http://localhost:4500/api/v1/biometric/revoke');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody.reason).toBe('User requested erasure');
    expect(result.data.status).toBe('REVOKED');
  });
});
