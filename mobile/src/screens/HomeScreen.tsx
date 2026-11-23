import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { UserProfile, ActiveScreen } from "../types";
import { storageService } from "../services/storage";
import { api } from "../services/api";
import { CONFIG } from "../config";

interface HomeScreenProps {
  onNavigate: (screen: ActiveScreen) => void;
  user: UserProfile | null;
  onRefreshUser: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate, user, onRefreshUser }) => {
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [couchbaseOk, setCouchbaseOk] = useState<boolean>(false);
  const [currentUrl, setCurrentUrl] = useState<string>(api.getBaseUrl());
  const [showUrlModal, setShowUrlModal] = useState<boolean>(false);
  const [inputUrl, setInputUrl] = useState<string>("");
  const [isDeletingBio, setIsDeletingBio] = useState<boolean>(false);

  useEffect(() => {
    storageService.getBackendUrl(CONFIG.API_BASE_URL).then((url) => {
      api.setBaseUrl(url);
      setCurrentUrl(url);
      checkHealth();
    });
  }, []);

  const checkHealth = async () => {
    setBackendStatus("checking");
    const res = await api.checkHealth();
    if (res.status === "healthy" || res.status === "online") {
      setBackendStatus("online");
      setCouchbaseOk(res.couchbaseOk);
    } else {
      setBackendStatus("offline");
      setCouchbaseOk(false);
    }
  };

  const handleOpenUrlModal = () => {
    setInputUrl(currentUrl);
    setShowUrlModal(true);
  };

  const handleSaveUrl = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      Alert.alert("Invalid URL", "Please enter a valid HTTP/HTTPS URL.");
      return;
    }
    api.setBaseUrl(trimmed);
    await storageService.saveBackendUrl(trimmed);
    setCurrentUrl(trimmed);
    setShowUrlModal(false);
    checkHealth();
  };

  const handleResetUrl = async () => {
    const defaultUrl = CONFIG.API_BASE_URL;
    api.setBaseUrl(defaultUrl);
    await storageService.saveBackendUrl(defaultUrl);
    setCurrentUrl(defaultUrl);
    setShowUrlModal(false);
    checkHealth();
  };

  const handleRemoveBiometrics = () => {
    if (!user) return;

    Alert.alert(
      "Remove Face Biometrics",
      "Are you sure you want to delete your enrolled face biometrics?\n\n• Your remote and local face templates will be permanently deleted.\n• Your user profile and attendance history will NOT be deleted.\n• You will need to re-enroll your face before marking attendance again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Biometrics",
          style: "destructive",
          onPress: async () => {
            setIsDeletingBio(true);
            try {
              // 1. Delete remote biometric template from Couchbase
              await api.deleteBiometrics(user.id);
            } catch (err: any) {
              Alert.alert(
                "Deletion Failed",
                err.message || "Failed to remove biometrics from backend. Please check your connection and try again."
              );
              setIsDeletingBio(false);
              return;
            }

            try {
              // 2. Clear local biometric embedding from SecureStore
              await storageService.clearBiometrics();

              // 3. Update local user profile flag (preserving name, id, timezone, and attendance history)
              const updatedUser: UserProfile = { ...user, hasBiometrics: false };
              await storageService.saveUserProfile(updatedUser);

              onRefreshUser();
              Alert.alert("Success", "Your face biometrics have been permanently removed.");
            } catch (localErr: any) {
              Alert.alert(
                "Partial Deletion Warning",
                "Remote biometric template was deleted, but clearing local secure storage failed: " +
                  (localErr.message || "Unknown local storage error.")
              );
            } finally {
              setIsDeletingBio(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Backend Status Badge & Config */}
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    backendStatus === "online" ? "#22C55E" : backendStatus === "checking" ? "#EAB308" : "#EF4444",
                },
              ]}
            />
            <Text style={styles.statusText}>
              Backend: {backendStatus.toUpperCase()} {couchbaseOk ? "(DB Connected)" : ""}
            </Text>
          </View>
          <View style={styles.statusActionRow}>
            <TouchableOpacity onPress={handleOpenUrlModal} style={styles.configBtn}>
              <Text style={styles.configBtnText}>⚙ URL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={checkHealth} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>Check</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.urlSubtext} numberOfLines={1}>
          Endpoint: {currentUrl}
        </Text>
      </View>

      {/* User Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>User Identity</Text>
        {user ? (
          <View>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userId}>ID: {user.id}</Text>
            <Text style={styles.userMeta}>Timezone: {user.timezone}</Text>
            <View style={styles.bioBadge}>
              <Text style={styles.bioBadgeText}>
                {user.hasBiometrics ? "Face Enrolled" : "Face Not Enrolled"}
              </Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.notRegisteredText}>No user registered on this device yet.</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onNavigate("register")}
            >
              <Text style={styles.btnText}>Register Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {user && (
        <View style={styles.actions}>
          {!user.hasBiometrics && (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.enrollBtn]}
              onPress={() => onNavigate("enroll")}
            >
              <Text style={styles.btnText}>Enroll Face Biometrics</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              styles.attendanceBtn,
              !user.hasBiometrics && styles.disabledBtn,
            ]}
            disabled={!user.hasBiometrics}
            onPress={() => onNavigate("verify")}
          >
            <Text style={styles.btnText}>Mark Today's Attendance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => onNavigate("history")}
          >
            <Text style={styles.secondaryBtnText}>View Attendance History</Text>
          </TouchableOpacity>

          {user.hasBiometrics && (
            <TouchableOpacity
              style={styles.removeBioBtn}
              onPress={handleRemoveBiometrics}
              disabled={isDeletingBio}
            >
              {isDeletingBio ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={styles.removeBioBtnText}>Remove Face Biometrics</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Server URL Configuration Modal */}
      <Modal
        visible={showUrlModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUrlModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backend API Configuration</Text>
            <Text style={styles.modalSubtitle}>
              Enter the backend URL (e.g. your PC's LAN IP or ngrok/tethering address):
            </Text>

            <TextInput
              style={styles.modalInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://192.168.0.7:3000"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowUrlModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={handleResetUrl}
              >
                <Text style={styles.modalResetBtnText}>Default</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveUrl}
              >
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Standalone Face Attendance • Expo SDK 54 • On-Device MobileFaceNet
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  statusContainer: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  configBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#0F172A",
  },
  configBtnText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  urlSubtext: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 4,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "500",
  },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  refreshBtnText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  userName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  userId: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
    fontFamily: "monospace",
  },
  userMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  bioBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#0369A1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bioBadgeText: {
    color: "#E0F2FE",
    fontSize: 12,
    fontWeight: "600",
  },
  notRegisteredText: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 14,
  },
  actions: {
    gap: 12,
    marginTop: 20,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  enrollBtn: {
    backgroundColor: "#0284C7",
  },
  attendanceBtn: {
    backgroundColor: "#16A34A",
  },
  disabledBtn: {
    backgroundColor: "#334155",
    opacity: 0.6,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "600",
  },
  removeBioBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  removeBioBtnText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 14,
    fontFamily: "monospace",
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  modalCancelBtnText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
  modalResetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#334155",
  },
  modalResetBtnText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#2563EB",
  },
  modalSaveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  footerText: {
    color: "#475569",
    fontSize: 11,
    textAlign: "center",
  },
});
