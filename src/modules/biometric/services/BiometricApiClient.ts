import type {
  BiometricStatus,
  CheckinInput,
  CheckinResult,
} from '../types';

export interface BiometricStatusResponse {
  status: BiometricStatus;
  enrolled_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

export interface EnrollPayload {
  vector_center: number[];
  vector_left: number[];
  vector_right: number[];
  consent_version?: string;
  consent_language?: 'en' | 'te';
  device_fingerprint?: string;
  device_model?: string;
  app_version?: string;
  re_enroll?: boolean;
}

export interface EnrollResponse {
  success: boolean;
  status: 'PENDING_APPROVAL';
  message: string;
  data: {
    status: 'PENDING_APPROVAL';
    enrolled_at: string;
  };
}

export interface EncryptedVectorsResponse {
  success: boolean;
  data: {
    encrypted_vectors: {
      alg: string;
      kid: string;
      iv: string;
      ciphertext: string;
      sig: string;
    };
    vectors?: {
      vector_center: number[];
      vector_left: number[];
      vector_right: number[];
    };
  };
}

export class ApiHttpError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * BiometricApiClient
 *
 * Consumes KCS-Backend /api/v1/ biometric and attendance endpoints.
 */
export class BiometricApiClient {
  private baseUrl: string;
  private tokenProvider: () => Promise<string> | string;
  private customFetch?: typeof fetch;

  constructor(
    baseUrl: string = 'http://localhost:3000',
    tokenProvider: () => Promise<string> | string = () => '',
    customFetch?: typeof fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.tokenProvider = tokenProvider;
    this.customFetch = customFetch;
  }

  private async getHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
    const token = await this.tokenProvider();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private get fetchFn(): typeof fetch {
    return this.customFetch || globalThis.fetch;
  }

  public static readonly DEFAULT_TIMEOUT_MS = 15000;

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = BiometricApiClient.DEFAULT_TIMEOUT_MS
  ): Promise<Response> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await this.fetchFn(url, {
        ...options,
        ...(controller ? { signal: controller.signal } : {}),
      });
      return response;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message?.toLowerCase().includes('cancel') ||
          err.message?.toLowerCase().includes('abort'))
      ) {
        throw new ApiHttpError(
          `Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s.\nBackend server may be offline or unreachable on your local network.`,
          408,
          'REQUEST_TIMEOUT'
        );
      }
      if (
        err instanceof Error &&
        (err.message?.includes('Network request failed') || err.message?.includes('Failed to fetch'))
      ) {
        throw new ApiHttpError(
          `Cannot reach ${this.baseUrl}.\n\nPlease ensure:\n1. KCS-Backend is running on port 4500\n2. Your mobile and PC are on the same Wi-Fi\n3. Windows Firewall allows inbound connections on port 4500`,
          503,
          'NETWORK_UNREACHABLE'
        );
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * GET /api/v1/biometric/status
   */
  public async getStatus(): Promise<BiometricStatusResponse> {
    const headers = await this.getHeaders();
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/biometric/status`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error?.message || err.message || `Failed to fetch status (HTTP ${res.status})`;
      throw new ApiHttpError(message, res.status, err.error?.code, err.error?.details);
    }

    const payload = await res.json();
    return payload.data as BiometricStatusResponse;
  }

  /**
   * POST /api/v1/biometric/enroll
   */
  public async enroll(payload: EnrollPayload): Promise<EnrollResponse> {
    const headers = await this.getHeaders();
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/biometric/enroll`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let message = err.error?.message || err.message || `Enrollment failed (HTTP ${res.status})`;
      if (res.status === 401) {
        message = 'Unauthorized (HTTP 401): Please sign in with valid Teacher credentials before enrolling.';
      }
      throw new ApiHttpError(message, res.status, err.error?.code, err.error?.details);
    }

    return (await res.json()) as EnrollResponse;
  }

  /**
   * POST /api/v1/attendance/checkin
   */
  public async checkin(input: CheckinInput): Promise<CheckinResult> {
    const headers = await this.getHeaders();
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/attendance/checkin`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error?.message || err.message || `Attendance check-in rejected (HTTP ${res.status})`;
      throw new ApiHttpError(message, res.status, err.error?.code, err.error?.details);
    }

    return (await res.json()) as CheckinResult;
  }

  /**
   * GET /api/v1/biometric/vectors
   * Downloads encrypted baseline vectors for phone switch re-download.
   */
  public async getVectors(deviceFingerprint: string): Promise<EncryptedVectorsResponse> {
    const headers = await this.getHeaders({
      'X-Device-Fingerprint': deviceFingerprint,
    });
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/biometric/vectors`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error?.message || err.message || `Vector download failed (HTTP ${res.status})`;
      throw new ApiHttpError(message, res.status, err.error?.code, err.error?.details);
    }

    return (await res.json()) as EncryptedVectorsResponse;
  }

  /**
   * POST /api/v1/biometric/revoke
   * Revokes biometric consent under DPDP Act 2023.
   */
  public async revokeConsent(reason?: string): Promise<{
    success: boolean;
    message: string;
    data: { status: 'REVOKED'; revoked_at: string };
  }> {
    const headers = await this.getHeaders();
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/biometric/revoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error?.message || err.message || `Revocation failed (HTTP ${res.status})`;
      throw new ApiHttpError(message, res.status, err.error?.code, err.error?.details);
    }

    return (await res.json()) as {
      success: boolean;
      message: string;
      data: { status: 'REVOKED'; revoked_at: string };
    };
  }
}
