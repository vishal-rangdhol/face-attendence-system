import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BiometricApiClient } from './src/modules/biometric/services/BiometricApiClient';
import { BiometricCheckinScreen } from './src/modules/biometric/screens/BiometricCheckinScreen';
import { BiometricEnrollmentScreen } from './src/modules/biometric/screens/BiometricEnrollmentScreen';
import { OfflinePunchQueue } from './src/modules/biometric/services/OfflinePunchQueue';
import {
  resolveApiBaseUrl,
  resolveAuthToken,
} from './src/modules/biometric/services/AppConfig';
import { SecureStoreKeychainManager } from './src/modules/biometric/services/SecureStoreKeychainManager';

export default function App() {
  const [activeTab, setActiveTab] = useState<'checkin' | 'enrollment'>('checkin');
  const [offlineCount, setOfflineCount] = useState(0);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => resolveApiBaseUrl());
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [activeUser, setActiveUser] = useState<{ name?: string; email?: string; campusId?: string } | null>(null);

  // Settings / Teacher Sign-In Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState(apiBaseUrl);
  const [loginId, setLoginId] = useState('vishalrangdhol@gmail.com');
  const [password, setPassword] = useState('kcs123');
  const [customJwt, setCustomJwt] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);

  const apiClient = useMemo(() => {
    return new BiometricApiClient(apiBaseUrl, resolveAuthToken);
  }, [apiBaseUrl]);

  const refreshOfflineQueue = async () => {
    const queue = await OfflinePunchQueue.getAll();
    setOfflineCount(queue.length);
  };

  const [healthErrorDetail, setHealthErrorDetail] = useState<string | null>(null);

  const checkHealth = useCallback(async (url: string) => {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

      let isOk = false;
      // 1. Try lightweight root /health first
      try {
        const pingRes = await fetch(`${cleanUrl}/health`, {
          method: 'GET',
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (pingRes.ok) isOk = true;
      } catch {
        // Fallback
      }

      // 2. Try /api/health if root ping didn't succeed
      if (!isOk) {
        try {
          const apiRes = await fetch(`${cleanUrl}/api/health`, {
            method: 'GET',
            ...(controller ? { signal: controller.signal } : {}),
          });
          if (apiRes.ok || apiRes.status === 200 || apiRes.status === 503) {
            isOk = true;
          }
        } catch {
          // Fallback
        }
      }

      if (timeoutId) clearTimeout(timeoutId);
      setBackendOnline(isOk);
      if (isOk) {
        setHealthErrorDetail(null);
      } else {
        setHealthErrorDetail('Server returned non-200 or is still starting.');
      }
    } catch (err: unknown) {
      setBackendOnline(false);
      const msg = err instanceof Error ? err.message : 'Network request failed';
      setHealthErrorDetail(msg);
    }
  }, []);

  const loadAuthUser = async () => {
    const info = await SecureStoreKeychainManager.getUserInfo();
    const token = await SecureStoreKeychainManager.getAuthToken();
    if (token && info) {
      setActiveUser(info);
    } else if (token) {
      setActiveUser({ name: 'Teacher', email: 'Authenticated via Token' });
    } else {
      setActiveUser(null);
    }
  };

  useEffect(() => {
    void refreshOfflineQueue();
    void checkHealth(apiBaseUrl);
    void loadAuthUser();
  }, [activeTab, apiBaseUrl, checkHealth]);

  const handleSyncOffline = async () => {
    await OfflinePunchQueue.flush(apiClient);
    await refreshOfflineQueue();
  };

  const handleTeacherLogin = async () => {
    if (!loginId.trim() || !password.trim()) {
      setAuthFeedback('Please enter both Login ID and Password.');
      return;
    }
    setAuthLoading(true);
    setAuthFeedback(null);
    try {
      const url = `${apiBaseUrl.replace(/\/+$/, '')}/api/auth/login`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: loginId.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || `Login failed (HTTP ${res.status})`);
      }

      const token = data.access_token || data.token;
      if (!token) {
        throw new Error('No access_token returned by backend server.');
      }

      await SecureStoreKeychainManager.saveAuthToken(token);
      const userObj = data.user || {};
      const teacherName =
        (userObj.first_name ? `${userObj.first_name} ${userObj.last_name || ''}`.trim() : null) ||
        userObj.name ||
        loginId.trim();

      const userInfo = {
        name: teacherName,
        email: userObj.email || loginId.trim(),
        campusId: data.campus_id || userObj.campus_id || 'system',
      };
      await SecureStoreKeychainManager.saveUserInfo(userInfo);
      setActiveUser(userInfo);
      setAuthFeedback(`✓ Signed in as ${teacherName}!`);
      setTimeout(() => {
        setIsSettingsOpen(false);
        setAuthFeedback(null);
      }, 1200);
    } catch (err: unknown) {
      setAuthFeedback(err instanceof Error ? err.message : 'Teacher login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveCustomJwt = async () => {
    if (!customJwt.trim()) return;
    try {
      await SecureStoreKeychainManager.saveAuthToken(customJwt.trim());
      await SecureStoreKeychainManager.saveUserInfo({
        name: 'Custom Teacher Session',
        email: 'Direct JWT Injected',
      });
      await loadAuthUser();
      setAuthFeedback('✓ Custom JWT token saved to device keystore!');
      setTimeout(() => {
        setIsSettingsOpen(false);
        setAuthFeedback(null);
      }, 1000);
    } catch (err: unknown) {
      setAuthFeedback(err instanceof Error ? err.message : 'Failed to save token');
    }
  };

  const handleSignOut = async () => {
    await SecureStoreKeychainManager.clearAuthToken();
    await SecureStoreKeychainManager.clearUserInfo();
    setActiveUser(null);
    setAuthFeedback('Signed out. Mobile will use offline dev mode.');
  };

  const handleSaveUrl = () => {
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setApiBaseUrl(clean);
      void checkHealth(clean);
      setAuthFeedback(`Server URL set to ${clean}`);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0F12" />

        {/* Top Header & Tab Navigation */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.appTitle}>LCU Biometric Attendance</Text>
              {activeUser && (
                <Text style={styles.userSubheader} numberOfLines={1}>
                  👤 {activeUser.name} {activeUser.campusId ? `(${activeUser.campusId})` : ''}
                </Text>
              )}
            </View>

            <View style={styles.badgeRow}>
              {offlineCount > 0 && (
                <TouchableOpacity style={styles.syncBadge} onPress={() => void handleSyncOffline()}>
                  <Text style={styles.syncText}>Sync {offlineCount}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.urlPill}
                onPress={() => {
                  setInputUrl(apiBaseUrl);
                  setAuthFeedback(null);
                  setIsSettingsOpen(true);
                  void checkHealth(apiBaseUrl);
                }}
              >
                <View
                  style={[
                    styles.statusDot,
                    backendOnline === true
                      ? styles.statusOnline
                      : backendOnline === false
                      ? styles.statusOffline
                      : styles.statusChecking,
                  ]}
                />
                <Text style={styles.urlPillText} numberOfLines={1}>
                  {apiBaseUrl.replace(/^https?:\/\//, '')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gearBtn}
                onPress={() => {
                  setInputUrl(apiBaseUrl);
                  setAuthFeedback(null);
                  setIsSettingsOpen(true);
                  void checkHealth(apiBaseUrl);
                }}
              >
                <Text style={styles.gearIcon}>⚙️</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'checkin' && styles.tabActive]}
              onPress={() => setActiveTab('checkin')}
            >
              <Text style={[styles.tabText, activeTab === 'checkin' && styles.tabTextActive]}>
                Daily Check-In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'enrollment' && styles.tabActive]}
              onPress={() => setActiveTab('enrollment')}
            >
              <Text style={[styles.tabText, activeTab === 'enrollment' && styles.tabTextActive]}>
                Staff Enrollment
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Screen Body */}
        <View style={styles.content}>
          {activeTab === 'checkin' ? (
            <BiometricCheckinScreen
              apiClient={apiClient}
              eventType="CHECK_IN"
              onFinished={() => void refreshOfflineQueue()}
            />
          ) : (
            <BiometricEnrollmentScreen
              apiClient={apiClient}
              onFinished={() => setActiveTab('checkin')}
            />
          )}
        </View>

        {/* Settings & Teacher Login Modal */}
        <Modal
          visible={isSettingsOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsSettingsOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Server Connection & Teacher Login</Text>
                <TouchableOpacity onPress={() => setIsSettingsOpen(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* 1. Connection Status */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionLabel}>Backend Server URL</Text>
                  <View style={styles.urlInputRow}>
                    <TextInput
                      style={styles.textInput}
                      value={inputUrl}
                      onChangeText={setInputUrl}
                      placeholder="http://192.168.x.x:4500"
                      placeholderTextColor="#64748B"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={styles.applyBtn} onPress={handleSaveUrl}>
                      <Text style={styles.applyBtnText}>Set</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        backendOnline === true
                          ? styles.statusOnline
                          : backendOnline === false
                          ? styles.statusOffline
                          : styles.statusChecking,
                      ]}
                    />
                    <Text style={styles.statusText}>
                      {backendOnline === true
                        ? 'Backend Online (Port 4500 Reachable)'
                        : backendOnline === false
                        ? 'Backend Unreachable'
                        : 'Checking connection...'}
                    </Text>
                    <TouchableOpacity onPress={() => void checkHealth(apiBaseUrl)}>
                      <Text style={styles.retryLink}>Check</Text>
                    </TouchableOpacity>
                  </View>
                  {backendOnline === false && healthErrorDetail && (
                    <Text style={styles.errorSubDetail}>Details: {healthErrorDetail}</Text>
                  )}
                </View>

                {/* 2. Active Session */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionLabel}>Authenticated Teacher</Text>
                  {activeUser ? (
                    <View style={styles.userInfoBox}>
                      <Text style={styles.userNameText}>✓ {activeUser.name}</Text>
                      {activeUser.email && (
                        <Text style={styles.userEmailText}>{activeUser.email}</Text>
                      )}
                      {activeUser.campusId && (
                        <Text style={styles.userCampusText}>Campus ID: {activeUser.campusId}</Text>
                      )}
                      <TouchableOpacity style={styles.signOutBtn} onPress={() => void handleSignOut()}>
                        <Text style={styles.signOutText}>Sign Out / Clear Token</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.noUserText}>
                      ⚠️ No teacher session active. Enrollments will save offline only until you sign in.
                    </Text>
                  )}
                </View>

                {/* 3. Teacher Sign-in Form */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionLabel}>Sign In as Teacher</Text>
                  <Text style={styles.helperText}>
                    Logs in to KCS-Backend and stores a genuine JWT session into hardware keystore.
                  </Text>

                  <Text style={styles.inputLabel}>Login ID / Email</Text>
                  <TextInput
                    style={styles.textInput}
                    value={loginId}
                    onChangeText={setLoginId}
                    placeholder="e.g. teacher@kcs.com"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />

                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#64748B"
                    secureTextEntry
                  />

                  <TouchableOpacity
                    style={[styles.primaryActionBtn, authLoading && styles.btnDisabled]}
                    onPress={() => void handleTeacherLogin()}
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryActionBtnText}>Sign In as Teacher</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 4. Or Paste Manual Token */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionLabel}>Or Paste Teacher JWT Token</Text>
                  <TextInput
                    style={[styles.textInput, { height: 60 }]}
                    value={customJwt}
                    onChangeText={setCustomJwt}
                    placeholder="eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9..."
                    placeholderTextColor="#64748B"
                    multiline
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => void handleSaveCustomJwt()}
                  >
                    <Text style={styles.secondaryActionBtnText}>Save JWT Token to Keystore</Text>
                  </TouchableOpacity>
                </View>

                {/* Feedback Banner */}
                {authFeedback && (
                  <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackText}>{authFeedback}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  header: {
    backgroundColor: '#13171C',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#252C35',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  appTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35', // LCU Orange
  },
  userSubheader: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  urlPillText: {
    fontSize: 10,
    color: '#CBD5E1',
    fontWeight: '500',
    maxWidth: 120,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusOnline: {
    backgroundColor: '#10B981',
  },
  statusOffline: {
    backgroundColor: '#EF4444',
  },
  statusChecking: {
    backgroundColor: '#F59E0B',
  },
  gearBtn: {
    padding: 4,
  },
  gearIcon: {
    fontSize: 15,
  },
  syncBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  syncText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000000',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1A1F26',
    borderRadius: 8,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8896A8',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#13171C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252C35',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#252C35',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalClose: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
    padding: 4,
  },
  modalBody: {
    maxHeight: 520,
  },
  sectionBox: {
    backgroundColor: '#1A1F26',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#252C35',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 8,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
  },
  applyBtn: {
    backgroundColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  statusText: {
    fontSize: 11,
    color: '#CBD5E1',
    flex: 1,
  },
  retryLink: {
    fontSize: 11,
    color: '#FF6B35',
    fontWeight: '600',
  },
  errorSubDetail: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  userInfoBox: {
    backgroundColor: '#0D0F12',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  userNameText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 13,
  },
  userEmailText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  userCampusText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  signOutBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  signOutText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  noUserText: {
    color: '#F59E0B',
    fontSize: 12,
  },
  inputLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    marginBottom: 4,
    marginTop: 6,
  },
  primaryActionBtn: {
    backgroundColor: '#FF6B35',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  secondaryActionBtn: {
    backgroundColor: '#374151',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  feedbackBox: {
    backgroundColor: '#272015',
    borderWidth: 1,
    borderColor: '#78350F',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  feedbackText: {
    color: '#FCD34D',
    fontSize: 12,
    textAlign: 'center',
  },
});
