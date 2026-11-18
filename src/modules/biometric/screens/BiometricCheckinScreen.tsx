import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { CameraView, Camera } from 'expo-camera';

import type {
  AttendanceEventType,
  DetectedFace,
  CheckinResult,
} from '../types';
import { MLKitQualityAssessor } from '../engines/MLKitQualityAssessor';
import { LivenessChallengeController } from '../engines/LivenessChallengeController';
import { MobileFaceNetEngine } from '../engines/MobileFaceNetEngine';
import { VectorMatchEngine } from '../engines/VectorMatchEngine';
import { SecureStoreKeychainManager } from '../services/SecureStoreKeychainManager';
import { DeviceIdentityManager } from '../services/DeviceIdentityManager';
import { OfflinePunchQueue } from '../services/OfflinePunchQueue';
import { BiometricApiClient, ApiHttpError } from '../services/BiometricApiClient';
import { AlignmentOvalGuide, type OvalBorderState } from '../components/AlignmentOvalGuide';
import { BiometricCameraOverlay } from '../components/BiometricCameraOverlay';

export type CheckinStep =
  | 'INITIALIZING'
  | 'ALIGNING'
  | 'CHALLENGE_ACTIVE'
  | 'MATCHING'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'REJECTED';

interface BiometricCheckinScreenProps {
  apiClient: BiometricApiClient;
  eventType?: AttendanceEventType;
  onFinished?: (result: CheckinResult | null) => void;
}

export const BiometricCheckinScreen: React.FC<BiometricCheckinScreenProps> = ({
  apiClient,
  eventType = 'CHECK_IN',
  onFinished,
}) => {
  const [step, setStep] = useState<CheckinStep>('INITIALIZING');
  const [instruction, setInstruction] = useState('Initializing camera and security modules...');
  const [ovalState, setOvalState] = useState<OvalBorderState>('neutral');
  const [lastResult, setLastResult] = useState<CheckinResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingChallengeSeconds, setRemainingChallengeSeconds] = useState(0);

  const challengeControllerRef = useRef(new LivenessChallengeController());
  const faceNetEngineRef = useRef(new MobileFaceNetEngine());
  const isProcessingRef = useRef(false);

  const startCheckinFlow = useCallback(() => {
    setStep('ALIGNING');
    setOvalState('neutral');
    setInstruction('Position your face inside the oval guide');
    setErrorMessage(null);
    challengeControllerRef.current.reset();
    isProcessingRef.current = false;
  }, []);

  const verifyPermissions = useCallback(async (): Promise<boolean> => {
    let cameraAllowed = false;
    try {
      if (Camera && typeof Camera.requestCameraPermissionsAsync === 'function') {
        const { status } = await Camera.requestCameraPermissionsAsync();
        cameraAllowed = status === 'granted';
      } else {
        cameraAllowed = true;
      }
    } catch {
      cameraAllowed = true; // Graceful fallback for test or web environments
    }

    if (!cameraAllowed) {
      setStep('REJECTED');
      setErrorMessage(
        'Camera access is required for biometric check-in. Please enable camera permission in device settings.'
      );
      setOvalState('error');
      return false;
    }

    // Request location permissions (Soft signal)
    await Location.requestForegroundPermissionsAsync().catch(() => {});
    return true;
  }, []);

  const handleRestoreProfile = useCallback(async () => {
    try {
      setStep('INITIALIZING');
      setInstruction('Restoring biometric profile from server...');
      const deviceId = await DeviceIdentityManager.getDeviceId();
      const res = await apiClient.getVectors(deviceId);
      if (res.data.vectors) {
        await SecureStoreKeychainManager.saveBaselineVectors({
          ...res.data.vectors,
          updated_at: new Date().toISOString(),
        });
        const permissionsGranted = await verifyPermissions();
        if (permissionsGranted) {
          startCheckinFlow();
        }
      } else {
        throw new Error('No baseline vector data received');
      }
    } catch (e: unknown) {
      setStep('REJECTED');
      setErrorMessage(e instanceof Error ? e.message : 'Failed to restore vectors from server');
      setOvalState('error');
    }
  }, [apiClient, startCheckinFlow, verifyPermissions]);

  const handleRevokeConsent = useCallback(async () => {
    try {
      setStep('INITIALIZING');
      setInstruction('Revoking biometric consent and purging vectors...');
      await apiClient.revokeConsent('Teacher requested consent revocation');
      await SecureStoreKeychainManager.clearBaselineVectors();
      setStep('REJECTED');
      setErrorMessage('Biometric consent revoked. Baseline vectors permanently erased under DPDP Act 2023.');
      setOvalState('error');
    } catch (e: unknown) {
      setStep('REJECTED');
      setErrorMessage(e instanceof Error ? e.message : 'Failed to revoke biometric consent');
      setOvalState('error');
    }
  }, [apiClient]);

  // Initialize dependencies on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        await faceNetEngineRef.current.initialize();
        let baselines = await SecureStoreKeychainManager.getBaselineVectors();

        // Phone-switch scenario: Auto-restore if user has active baseline on server
        if (!baselines) {
          try {
            if (isMounted) setInstruction('Checking biometric profile on server...');
            const statusRes = await apiClient.getStatus();

            if (statusRes.status === 'ACTIVE') {
              if (isMounted) setInstruction('Profile found. Restoring vectors to this device...');
              const deviceId = await DeviceIdentityManager.getDeviceId();
              const vectorRes = await apiClient.getVectors(deviceId);

              if (vectorRes.data.vectors) {
                const restored = {
                  vector_center: vectorRes.data.vectors.vector_center,
                  vector_left: vectorRes.data.vectors.vector_left,
                  vector_right: vectorRes.data.vectors.vector_right,
                  updated_at: new Date().toISOString(),
                };
                await SecureStoreKeychainManager.saveBaselineVectors(restored);
                baselines = restored;
              }
            } else if (statusRes.status === 'PENDING_APPROVAL') {
              if (isMounted) {
                setStep('REJECTED');
                setErrorMessage('Your biometric profile is awaiting Admin approval.');
                setOvalState('warning');
              }
              return;
            } else if (statusRes.status === 'REVOKED') {
              await SecureStoreKeychainManager.clearBaselineVectors();
              if (isMounted) {
                setStep('REJECTED');
                setErrorMessage('Biometric consent was revoked. Baseline vectors have been erased.');
                setOvalState('error');
              }
              return;
            } else {
              if (isMounted) {
                setStep('REJECTED');
                setErrorMessage('No biometric profile found. Please complete staff enrollment first.');
                setOvalState('error');
              }
              return;
            }
          } catch (recoveryErr: unknown) {
            if (isMounted) {
              setStep('REJECTED');
              setErrorMessage(
                recoveryErr instanceof Error
                  ? recoveryErr.message
                  : 'No biometric baseline found. Please connect to internet to restore your profile.'
              );
              setOvalState('error');
            }
            return;
          }
        }

        if (!baselines) {
          if (isMounted) {
            setStep('REJECTED');
            setErrorMessage('No enrolled biometric baseline found. Please enroll or download vectors first.');
            setOvalState('error');
          }
          return;
        }

        const permissionsGranted = await verifyPermissions();
        if (!permissionsGranted) return;

        if (isMounted) {
          startCheckinFlow();
        }
      } catch (err: unknown) {
        if (isMounted) {
          setStep('REJECTED');
          setErrorMessage(err instanceof Error ? err.message : 'Initialization failed');
          setOvalState('error');
        }
      }
    }

    void init();
    return () => {
      isMounted = false;
      challengeControllerRef.current.reset();
    };
  }, [apiClient, startCheckinFlow, verifyPermissions]);

  /**
   * Evaluates incoming face detection frames from the camera
   */
  const handleFaceDetected = useCallback(async (detectedFace: DetectedFace | null) => {
    if (isProcessingRef.current || step === 'INITIALIZING' || step === 'SUCCESS' || step === 'REJECTED') {
      return;
    }

    // Step 1: Alignment & Quality
    if (step === 'ALIGNING') {
      const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
      const assessment = MLKitQualityAssessor.assess(
        detectedFace,
        screenWidth,
        screenHeight,
        { pose: 'center' }
      );
      if (!assessment.passed) {
        setInstruction(assessment.reason || 'Align your face properly');
        setOvalState('warning');
        return;
      }

      // Quality passed, transition to randomized single challenge
      const challenge = challengeControllerRef.current.selectRandomChallenge();
      setStep('CHALLENGE_ACTIVE');
      setOvalState('active');
      setInstruction(challenge.promptText);
      return;
    }

    // Step 2: Interactive Liveness Challenge
    if (step === 'CHALLENGE_ACTIVE') {
      const challengeState = challengeControllerRef.current.evaluateFrame(detectedFace);
      setRemainingChallengeSeconds(challengeState.remainingSeconds);

      if (challengeState.status === 'TIMEOUT') {
        setStep('REJECTED');
        setOvalState('error');
        setErrorMessage('Liveness challenge timed out. Please try again.');
        return;
      }

      if (challengeState.status === 'PASSED') {
        // Proceed to 1:1 Vector Extraction & Matching
        await performVectorMatch(detectedFace);
      }
    }
  }, [step]);

  /**
   * Extracts face embedding and matches against baseline vectors in SecureStore
   */
  const performVectorMatch = async (face: DetectedFace | null) => {
    isProcessingRef.current = true;
    setStep('MATCHING');
    setOvalState('active');
    setInstruction('Verifying facial identity...');

    try {
      const baselines = await SecureStoreKeychainManager.getBaselineVectors();
      if (!baselines) {
        throw new Error('Baseline biometric vectors missing from device keystore');
      }

      // Generate embedding vector via MobileFaceNet
      const candidateVector = await faceNetEngineRef.current.extractEmbedding(face);

      // Perform cosine similarity matching
      const matchResult = VectorMatchEngine.match(candidateVector, baselines);

      if (!matchResult.matched) {
        setStep('REJECTED');
        setOvalState('error');
        setErrorMessage(
          `Face mismatch (similarity: ${matchResult.similarity}, required: ${matchResult.threshold})`
        );
        isProcessingRef.current = false;
        return;
      }

      // Match verified! Proceed to record attendance punch
      await submitAttendancePunch(matchResult.similarity);
    } catch (err: unknown) {
      setStep('REJECTED');
      setOvalState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Biometric verification error');
      isProcessingRef.current = false;
    }
  };

  /**
   * Captures GPS and posts attendance punch to backend (or queues offline)
   */
  const submitAttendancePunch = async (confidence: number) => {
    setStep('SUBMITTING');
    setInstruction('Recording verified attendance punch...');

    const deviceId = await DeviceIdentityManager.getDeviceId();
    const timestampClient = new Date().toISOString();

    // Soft GPS capture
    let gpsLat: number | undefined;
    let gpsLng: number | undefined;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      gpsLat = location.coords.latitude;
      gpsLng = location.coords.longitude;
    } catch {
      // Soft signal tolerance: proceed even if GPS is unavailable
    }

    const payload = {
      event_type: eventType,
      verified: true,
      confidence,
      gps_lat: gpsLat,
      gps_lng: gpsLng,
      device_id: deviceId,
      timestamp_client: timestampClient,
    };

    try {
      const res = await apiClient.checkin(payload);
      setStep('SUCCESS');
      setOvalState('success');
      setLastResult(res);
      setInstruction(`${eventType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} Verified Successfully!`);
      if (onFinished) {
        onFinished(res);
      }
    } catch (err: unknown) {
      if (err instanceof ApiHttpError && err.status >= 400 && err.status < 500) {
        // Explicit domain rejection from server (Issue 1)
        // Must NEVER mask as offline success!
        setStep('REJECTED');
        setOvalState('error');
        setErrorMessage(err.message || 'Attendance check-in rejected by server');
        setInstruction('Check-in rejected. Please review error below.');
        return;
      }

      // Network failure or 5xx server downtime: queue offline punch for store-and-forward
      await OfflinePunchQueue.enqueue(payload);
      setStep('SUCCESS');
      setOvalState('success');
      setInstruction(`${eventType} Recorded Offline. Will sync when connected.`);
      setLastResult({
        success: true,
        status: 'RECORDED',
        log_id: 'offline_queued',
        flags: ['OFFLINE_PUNCH'],
      });
    } finally {
      isProcessingRef.current = false;
    }
  };

  return (
    <View style={styles.container}>
      {/* Viewport & Alignment Oval Guide */}
      <View style={styles.cameraViewport}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="picture"
          onFacesDetected={({ faces }: { faces?: DetectedFace[] }) => {
            void handleFaceDetected(faces && faces.length > 0 ? faces[0] : null);
          }}
        />

        <AlignmentOvalGuide state={ovalState} />

        {/* Overlay with instructions, header, and timer */}
        <BiometricCameraOverlay
          title={eventType === 'CHECK_IN' ? 'Staff Check-In' : 'Staff Check-Out'}
          subtitle="Align face and complete the randomized liveness challenge"
          instruction={instruction}
          statusBadge={step === 'CHALLENGE_ACTIVE' ? 'Liveness Challenge' : undefined}
          countdownSeconds={step === 'CHALLENGE_ACTIVE' ? remainingChallengeSeconds : undefined}
          onCancel={onFinished ? () => onFinished(null) : undefined}
        />
      </View>

      {/* State Feedback Cards */}
      {step === 'INITIALIZING' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>{instruction || 'Initializing Biometric Engine...'}</Text>
        </View>
      )}

      {step === 'SUCCESS' && (
        <View style={styles.resultCard}>
          <Text style={styles.successTitle}>✓ Punch Recorded</Text>
          <Text style={styles.resultDetails}>
            Type: {eventType} · Server ID: {lastResult?.log_id}
          </Text>
          {lastResult?.flags && lastResult.flags.length > 0 && (
            <Text style={styles.flagsText}>Flags: {lastResult.flags.join(', ')}</Text>
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onFinished && onFinished(lastResult)}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'REJECTED' && (
        <View style={[styles.resultCard, styles.errorCard]}>
          <Text style={styles.errorTitle}>Verification Failed</Text>
          <Text style={styles.errorMessage}>{errorMessage || 'Please try again'}</Text>
          <View style={styles.buttonRow}>
            {!(
              errorMessage?.includes('baseline') ||
              errorMessage?.includes('awaiting Admin') ||
              errorMessage?.includes('No biometric profile')
            ) && (
              <TouchableOpacity style={styles.retryButton} onPress={startCheckinFlow}>
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestoreProfile}
            >
              <Text style={styles.primaryButtonText}>Restore Profile</Text>
            </TouchableOpacity>
          </View>
          {!errorMessage?.includes('revoked') && !errorMessage?.includes('No biometric profile') && (
            <TouchableOpacity style={styles.revokeButton} onPress={handleRevokeConsent}>
              <Text style={styles.revokeButtonText}>Revoke Biometric Consent (DPDP Act)</Text>
            </TouchableOpacity>
          )}
          {typeof __DEV__ !== 'undefined' && __DEV__ && errorMessage?.includes('No enrolled biometric baseline') && (
            <TouchableOpacity
              style={styles.devSeedButton}
              onPress={async () => {
                const dummyVector = new Array(128).fill(0.088);
                await SecureStoreKeychainManager.saveBaselineVectors({
                  vector_center: dummyVector,
                  vector_left: dummyVector,
                  vector_right: dummyVector,
                  updated_at: new Date().toISOString(),
                });
                startCheckinFlow();
              }}
            >
              <Text style={styles.devSimText}>Seed Dev Baseline Vectors</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Dev Testing Assistance (Emulator/Simulator without camera) */}
      {typeof __DEV__ !== 'undefined' && __DEV__ && (step === 'ALIGNING' || step === 'CHALLENGE_ACTIVE') && (
        <View style={styles.devBar}>
          <TouchableOpacity
            style={styles.devSimButton}
            onPress={() => {
              const currentChallenge = challengeControllerRef.current.getState().currentChallenge;
              let simulatedYaw = 0;
              let simulatedSmile = 0.1;
              const leftEye = 0.95;
              const rightEye = 0.95;

              if (step === 'CHALLENGE_ACTIVE' && currentChallenge) {
                if (currentChallenge.type === 'TURN_LEFT') simulatedYaw = 24;
                if (currentChallenge.type === 'TURN_RIGHT') simulatedYaw = -24;
                if (currentChallenge.type === 'SMILE') simulatedSmile = 0.95;
                if (currentChallenge.type === 'BLINK') {
                  // Simulate blink down then up
                  void handleFaceDetected({
                    bounds: { origin: { x: 100, y: 100 }, size: { width: 180, height: 240 } },
                    rollAngle: 0,
                    yawAngle: 0,
                    leftEyeOpenProbability: 0.1,
                    rightEyeOpenProbability: 0.1,
                    smilingProbability: 0.1,
                  });
                }
              }

              void handleFaceDetected({
                bounds: { origin: { x: 100, y: 100 }, size: { width: 180, height: 240 } },
                rollAngle: 0,
                yawAngle: simulatedYaw,
                leftEyeOpenProbability: leftEye,
                rightEyeOpenProbability: rightEye,
                smilingProbability: simulatedSmile,
              });
            }}
          >
            <Text style={styles.devSimText}>⚡ [DEV SIMULATE FACE FRAME]</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  cameraViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#13171C',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 15, 18, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 14,
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '500',
  },
  resultCard: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#1A1F26',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#252C35',
    alignItems: 'center',
  },
  errorCard: {
    borderColor: '#EF4444',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  resultDetails: {
    marginTop: 6,
    fontSize: 13,
    color: '#8896A8',
  },
  flagsText: {
    marginTop: 4,
    fontSize: 12,
    color: '#F59E0B',
  },
  errorMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#E2E8F0',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  restoreButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  revokeButton: {
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  revokeButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  devBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  devSimButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  devSeedButton: {
    marginTop: 12,
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  devSimText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
});
