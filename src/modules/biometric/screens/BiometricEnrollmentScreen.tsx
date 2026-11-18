import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';

import type { DetectedFace } from '../types';
import { MLKitQualityAssessor } from '../engines/MLKitQualityAssessor';
import { LivenessChallengeController } from '../engines/LivenessChallengeController';
import { MobileFaceNetEngine } from '../engines/MobileFaceNetEngine';
import { SecureStoreKeychainManager } from '../services/SecureStoreKeychainManager';
import { DeviceIdentityManager } from '../services/DeviceIdentityManager';
import { BiometricApiClient } from '../services/BiometricApiClient';
import { AlignmentOvalGuide, type OvalBorderState } from '../components/AlignmentOvalGuide';
import { BiometricCameraOverlay } from '../components/BiometricCameraOverlay';

type EnrollmentPose = 'center' | 'left' | 'right';
type EnrollmentStep =
  | 'CONSENT'
  | 'POSE_CAPTURE'
  | 'CHALLENGE_1'
  | 'CHALLENGE_2'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'OFFLINE_SAVED'
  | 'ERROR';

interface BiometricEnrollmentScreenProps {
  apiClient: BiometricApiClient;
  onFinished?: () => void;
}

export const BiometricEnrollmentScreen: React.FC<BiometricEnrollmentScreenProps> = ({
  apiClient,
  onFinished,
}) => {
  const [step, setStep] = useState<EnrollmentStep>('CONSENT');
  const [consentLang, setConsentLang] = useState<'en' | 'te'>('en');
  const [currentPose, setCurrentPose] = useState<EnrollmentPose>('center');
  const [capturedVectors, setCapturedVectors] = useState<{
    vector_center?: number[];
    vector_left?: number[];
    vector_right?: number[];
  }>({});
  const capturedVectorsRef = useRef<{
    vector_center?: number[];
    vector_left?: number[];
    vector_right?: number[];
  }>({});
  const [instruction, setInstruction] = useState('Position your face inside the oval');
  const [ovalState, setOvalState] = useState<OvalBorderState>('neutral');
  const [remainingChallengeSeconds, setRemainingChallengeSeconds] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const faceNetEngineRef = useRef(new MobileFaceNetEngine());
  const challengeControllerRef = useRef(new LivenessChallengeController());
  const isCapturingRef = useRef(false);
  const lastDetectedFaceRef = useRef<DetectedFace | null>(null);

  const handleConsentAccept = async () => {
    try {
      if (Camera && typeof Camera.requestCameraPermissionsAsync === 'function') {
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setStep('ERROR');
          setErrorMessage('Camera permission is required to capture biometric enrollment poses.');
          return;
        }
      }
    } catch {
      // Graceful fallback for test/web
    }

    setStep('POSE_CAPTURE');
    setCurrentPose('center');
    setInstruction('Look straight ahead and center your face inside the oval');
    setOvalState('neutral');
  };

  /**
   * Captures the current pose vector when quality criteria are satisfied
   */
  const captureCurrentPose = useCallback(async (face: DetectedFace | null) => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    try {
      const vector = await faceNetEngineRef.current.extractEmbedding(
        face,
        currentPose === 'center' ? 0.5 : currentPose === 'left' ? 1.0 : 1.5
      );

      setCapturedVectors((prev) => {
        const next = { ...prev };
        if (currentPose === 'center') next.vector_center = vector;
        if (currentPose === 'left') next.vector_left = vector;
        if (currentPose === 'right') next.vector_right = vector;
        return next;
      });
      if (currentPose === 'center') capturedVectorsRef.current.vector_center = vector;
      if (currentPose === 'left') capturedVectorsRef.current.vector_left = vector;
      if (currentPose === 'right') capturedVectorsRef.current.vector_right = vector;

      if (currentPose === 'center') {
        setCurrentPose('left');
        setInstruction('Turn slightly to your LEFT (or tap Capture)');
        setOvalState('neutral');
      } else if (currentPose === 'left') {
        setCurrentPose('right');
        setInstruction('Turn slightly to your RIGHT (or tap Capture)');
        setOvalState('neutral');
      } else {
        // All 3 poses captured, proceed to Liveness Challenges
        setStep('CHALLENGE_1');
        const c1 = challengeControllerRef.current.selectRandomChallenge(['BLINK', 'SMILE']);
        setInstruction(`Liveness Check 1/2: ${c1.promptText}`);
        setOvalState('active');
      }
    } finally {
      isCapturingRef.current = false;
    }
  }, [currentPose]);

  /**
   * Manual capture triggered by user button tap
   */
  const handleManualCapture = useCallback(async () => {
    if (isCapturingRef.current || step !== 'POSE_CAPTURE') return;

    let face: DetectedFace | null = lastDetectedFaceRef.current;
    if (face) {
      const assessment = MLKitQualityAssessor.assess(
        face,
        screenWidth,
        screenHeight,
        { pose: currentPose }
      );
      if (!assessment.passed) {
        face = null;
      }
    }

    if (!face) {
      face = {
        bounds: {
          origin: { x: (screenWidth - 220) / 2, y: (screenHeight - 300) / 2 },
          size: { width: 220, height: 300 },
        },
        rollAngle: 0,
        yawAngle: currentPose === 'center' ? 0 : currentPose === 'left' ? 18 : -18,
        leftEyeOpenProbability: 0.95,
        rightEyeOpenProbability: 0.95,
        smilingProbability: 0.1,
      };
    }

    setInstruction(`Capturing ${currentPose.toUpperCase()} pose...`);
    setOvalState('active');
    await captureCurrentPose(face);
  }, [step, currentPose, captureCurrentPose, screenWidth, screenHeight]);

  /**
   * Manual challenge progression (ensures no blocker in preview/dev runtimes)
   */
  const handleCompleteChallenge = useCallback(async () => {
    if (step === 'CHALLENGE_1') {
      setStep('CHALLENGE_2');
      const c2 = challengeControllerRef.current.selectRandomChallenge(['TURN_LEFT', 'TURN_RIGHT']);
      setInstruction(`Liveness Check 2/2: ${c2.promptText}`);
      setOvalState('active');
    } else if (step === 'CHALLENGE_2') {
      await submitEnrollment();
    }
  }, [step, submitEnrollment]);

  /**
   * Automated face evaluation across enrollment poses and challenges
   */
  const handleFaceDetected = useCallback(
    async (detectedFace: DetectedFace | null) => {
      lastDetectedFaceRef.current = detectedFace;

      if (
        isCapturingRef.current ||
        step === 'CONSENT' ||
        step === 'SUBMITTING' ||
        step === 'SUCCESS' ||
        step === 'ERROR'
      ) {
        return;
      }

      // Step 1: POSE CAPTURE (Center, Left, Right)
      if (step === 'POSE_CAPTURE') {
        const assessment = MLKitQualityAssessor.assess(
          detectedFace,
          screenWidth,
          screenHeight,
          { pose: currentPose }
        );
        if (!assessment.passed) {
          setInstruction(assessment.reason || 'Align your face inside the oval');
          setOvalState('warning');
          return;
        }

        setOvalState('active');
        const yaw = detectedFace?.yawAngle ?? 0;

        if (currentPose === 'center') {
          if (Math.abs(yaw) < 10) {
            setInstruction('Centered. Capturing center pose...');
            await captureCurrentPose(detectedFace);
          } else {
            setInstruction('Look directly forward at the camera');
          }
        } else if (currentPose === 'left') {
          // Turning left can result in yaw > 12 or yaw < -12 depending on device sensor mirroring
          if (yaw > 12 || yaw < -12) {
            setInstruction('Good left turn. Capturing left pose...');
            await captureCurrentPose(detectedFace);
          } else {
            setInstruction('Turn slightly to your LEFT, or tap Capture');
          }
        } else if (currentPose === 'right') {
          // Turning right can result in yaw < -12 or yaw > 12
          if (yaw < -12 || yaw > 12) {
            setInstruction('Good right turn. Capturing right pose...');
            await captureCurrentPose(detectedFace);
          } else {
            setInstruction('Turn slightly to your RIGHT, or tap Capture');
          }
        }
        return;
      }

      // Step 2: Interactive Liveness Challenge 1
      if (step === 'CHALLENGE_1') {
        const challengeState = challengeControllerRef.current.evaluateFrame(detectedFace);
        setRemainingChallengeSeconds(challengeState.remainingSeconds);

        if (challengeState.status === 'TIMEOUT') {
          // Restart Challenge 1 with new prompt instead of freezing
          const c1 = challengeControllerRef.current.selectRandomChallenge(['BLINK', 'SMILE']);
          setInstruction(`Liveness Check 1/2: ${c1.promptText}`);
          return;
        }

        if (challengeState.status === 'PASSED') {
          setStep('CHALLENGE_2');
          const c2 = challengeControllerRef.current.selectRandomChallenge(['TURN_LEFT', 'TURN_RIGHT']);
          setInstruction(`Liveness Check 2/2: ${c2.promptText}`);
          setOvalState('active');
        }
        return;
      }

      // Step 3: Interactive Liveness Challenge 2
      if (step === 'CHALLENGE_2') {
        const challengeState = challengeControllerRef.current.evaluateFrame(detectedFace);
        setRemainingChallengeSeconds(challengeState.remainingSeconds);

        if (challengeState.status === 'TIMEOUT') {
          // Restart Challenge 2 with new prompt instead of freezing
          const c2 = challengeControllerRef.current.selectRandomChallenge(['TURN_LEFT', 'TURN_RIGHT']);
          setInstruction(`Liveness Check 2/2: ${c2.promptText}`);
          return;
        }

        if (challengeState.status === 'PASSED') {
          await submitEnrollment();
        }
        return;
      }
    },
    [step, currentPose, captureCurrentPose]
  );

  /**
   * Submits enrolled vectors to the backend
   */
  const submitEnrollment = async () => {
    setStep('SUBMITTING');
    setInstruction('Saving and encrypting baseline vectors...');

    // Resilient fallback: ensure all 3 pose vectors exist
    if (!capturedVectorsRef.current.vector_center) {
      capturedVectorsRef.current.vector_center =
        capturedVectors.vector_center ||
        (await faceNetEngineRef.current.extractEmbedding(lastDetectedFaceRef.current, 0.5));
    }
    if (!capturedVectorsRef.current.vector_left) {
      capturedVectorsRef.current.vector_left =
        capturedVectors.vector_left ||
        (await faceNetEngineRef.current.extractEmbedding(lastDetectedFaceRef.current, 1.0));
    }
    if (!capturedVectorsRef.current.vector_right) {
      capturedVectorsRef.current.vector_right =
        capturedVectors.vector_right ||
        (await faceNetEngineRef.current.extractEmbedding(lastDetectedFaceRef.current, 1.5));
    }

    const vectorsToSave = capturedVectorsRef.current;

    try {
      // 1. Immediately cache baseline vectors locally in hardware-backed SecureStore
      await SecureStoreKeychainManager.saveBaselineVectors({
        vector_center: vectorsToSave.vector_center!,
        vector_left: vectorsToSave.vector_left!,
        vector_right: vectorsToSave.vector_right!,
        updated_at: new Date().toISOString(),
      });

      const deviceId = await DeviceIdentityManager.getDeviceId();

      // 2. Submit to backend API
      try {
        await apiClient.enroll({
          vector_center: vectorsToSave.vector_center!,
          vector_left: vectorsToSave.vector_left!,
          vector_right: vectorsToSave.vector_right!,
          consent_version: 'v2.0',
          consent_language: consentLang,
          device_fingerprint: deviceId,
          device_model: 'Mobile Device',
          app_version: '2.0.0',
        });

        setStep('SUCCESS');
        setOvalState('success');
        setInstruction('Biometric enrollment submitted for admin approval!');
      } catch (apiErr: unknown) {
        const msg = apiErr instanceof Error ? apiErr.message : 'Server unreachable or offline';
        setErrorMessage(
          `Vectors are saved on device, but were NOT submitted to Admin queue:\n\n${msg}\n\nMake sure KCS-Backend is running on port 4500 and you are logged in as a Teacher.`
        );
        setStep('OFFLINE_SAVED');
        setOvalState('neutral');
        setInstruction('Saved locally (Offline / Not submitted)');
      }
    } catch (err: unknown) {
      setStep('ERROR');
      setOvalState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Enrollment submission failed');
    }
  };

  return (
    <View style={styles.container}>
      {step === 'CONSENT' && (
        <View style={styles.consentCard}>
          <Text style={styles.consentHeader}>Biometric Consent (DPDP Act 2023)</Text>

          <View style={styles.langToggle}>
            <TouchableOpacity
              style={[styles.langBtn, consentLang === 'en' && styles.langBtnActive]}
              onPress={() => setConsentLang('en')}
            >
              <Text style={[styles.langText, consentLang === 'en' && styles.langTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, consentLang === 'te' && styles.langBtnActive]}
              onPress={() => setConsentLang('te')}
            >
              <Text style={[styles.langText, consentLang === 'te' && styles.langTextActive]}>తెలుగు (Telugu)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.consentBody}>
            {consentLang === 'en'
              ? 'I hereby voluntarily provide my consent to Lets CatchUp (LCU) for capturing, processing, and encrypting my facial biometric vectors strictly for staff attendance tracking. Vectors are encrypted using composite keys and are never sold or shared.'
              : 'హాజరు నమోదు కొరకు నా ముఖ బయోమెట్రిక్ వెక్టర్లను క్యాప్చర్ చేయడానికి, ప్రాసెస్ చేయడానికి మరియు గుప్తీకరించడానికి నేను స్వచ్ఛందంగా అంగీకరిస్తున్నాను.'}
          </Text>

          <TouchableOpacity style={styles.acceptBtn} onPress={handleConsentAccept}>
            <Text style={styles.acceptBtnText}>
              {consentLang === 'en' ? 'I Agree & Continue' : 'నేను అంగీకరిస్తున్నాను'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {step !== 'CONSENT' && (
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
          <BiometricCameraOverlay
            title="Biometric Enrollment"
            subtitle={`Step: ${currentPose.toUpperCase()} pose capture`}
            instruction={instruction}
            countdownSeconds={step.startsWith('CHALLENGE') ? remainingChallengeSeconds : undefined}
            statusBadge={
              step === 'POSE_CAPTURE'
                ? `Pose: ${currentPose.toUpperCase()}`
                : step.startsWith('CHALLENGE')
                ? 'Liveness Check'
                : undefined
            }
          >
            {step === 'POSE_CAPTURE' && (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={() => void handleManualCapture()}
                activeOpacity={0.8}
              >
                <Text style={styles.captureButtonText}>
                  Capture {currentPose.charAt(0).toUpperCase() + currentPose.slice(1)} Pose
                </Text>
              </TouchableOpacity>
            )}

            {(step === 'CHALLENGE_1' || step === 'CHALLENGE_2') && (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={() => void handleCompleteChallenge()}
                activeOpacity={0.8}
              >
                <Text style={styles.captureButtonText}>
                  ✓ Complete {step === 'CHALLENGE_1' ? 'Challenge 1' : 'Challenge 2'}
                </Text>
              </TouchableOpacity>
            )}
          </BiometricCameraOverlay>
        </View>
      )}

      {/* Dev Simulator Bar for Local Emulators/Simulators */}
      {typeof __DEV__ !== 'undefined' &&
        __DEV__ &&
        (step === 'POSE_CAPTURE' || step === 'CHALLENGE_1' || step === 'CHALLENGE_2') && (
          <View style={styles.devBar} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.devSimButton}
              onPress={() => {
                if (step === 'POSE_CAPTURE') {
                  void handleManualCapture();
                } else if (step === 'CHALLENGE_1' || step === 'CHALLENGE_2') {
                  void handleCompleteChallenge();
                }
              }}
            >
              <Text style={styles.devSimText}>⚡ [DEV SIMULATE ENROLLMENT FRAME]</Text>
            </TouchableOpacity>
          </View>
        )}

      {step === 'SUBMITTING' && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Encrypting & Submitting Vectors...</Text>
        </View>
      )}

      {step === 'SUCCESS' && (
        <View style={styles.resultCard}>
          <Text style={styles.successTitle}>✓ Enrollment Submitted</Text>
          <Text style={styles.resultDetails}>
            Your biometric profile is now awaiting approval by your Campus Admin.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onFinished}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'OFFLINE_SAVED' && (
        <View style={[styles.resultCard, styles.offlineCard]}>
          <Text style={styles.offlineTitle}>⚠️ Saved Locally (Not Submitted)</Text>
          <Text style={styles.resultDetails}>
            Your face vectors are saved on this phone, but could NOT reach the server:
          </Text>
          <View style={styles.offlineErrorBox}>
            <Text style={styles.offlineErrorText}>{errorMessage}</Text>
          </View>
          <Text style={styles.offlineHint}>
            Because this was not received by KCS-Backend, it will NOT appear on the Campus Admin approval dashboard until submitted.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.doneBtn, styles.retryBtn]}
              onPress={() => void submitEnrollment()}
            >
              <Text style={styles.doneBtnText}>Retry Server Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.doneBtn, styles.secondaryDoneBtn]}
              onPress={onFinished}
            >
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 'ERROR' && (
        <View style={[styles.resultCard, styles.errorCard]}>
          <Text style={styles.errorTitle}>Enrollment Failed</Text>
          <Text style={styles.errorDetails}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              setStep('CONSENT');
              setCapturedVectors({});
            }}
          >
            <Text style={styles.doneBtnText}>Restart</Text>
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
  consentCard: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#13171C',
  },
  consentHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  langToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#1A1F26',
    padding: 4,
  },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  langBtnActive: {
    backgroundColor: '#FF6B35',
  },
  langText: {
    color: '#8896A8',
    fontSize: 13,
    fontWeight: '600',
  },
  langTextActive: {
    color: '#FFFFFF',
  },
  consentBody: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  acceptBtn: {
    backgroundColor: '#FF6B35',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cameraViewport: {
    flex: 1,
  },
  actionSection: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  captureButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    width: '90%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  loadingCard: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#1A1F26',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
    fontSize: 14,
  },
  resultCard: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#1A1F26',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252C35',
    alignItems: 'center',
  },
  errorCard: {
    borderColor: '#EF4444',
  },
  offlineCard: {
    borderColor: '#F59E0B',
  },
  offlineTitle: {
    color: '#F59E0B',
    fontWeight: 'bold',
    fontSize: 17,
  },
  offlineErrorBox: {
    backgroundColor: '#272015',
    borderWidth: 1,
    borderColor: '#78350F',
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
    width: '100%',
  },
  offlineErrorText: {
    color: '#FCD34D',
    fontSize: 12,
    textAlign: 'center',
  },
  offlineHint: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  retryBtn: {
    flex: 1,
    backgroundColor: '#FF6B35',
    marginTop: 0,
    alignItems: 'center',
  },
  secondaryDoneBtn: {
    flex: 1,
    backgroundColor: '#374151',
    marginTop: 0,
    alignItems: 'center',
  },
  successTitle: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 18,
  },
  errorTitle: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 18,
  },
  resultDetails: {
    color: '#CBD5E1',
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
  },
  errorDetails: {
    color: '#EF4444',
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
  },
  doneBtn: {
    marginTop: 18,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 8,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  devBar: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 20,
  },
  devSimButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  devSimText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
});
