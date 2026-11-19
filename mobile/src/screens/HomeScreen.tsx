import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { UserProfile, ActiveScreen } from "../types";
import { storageService } from "../services/storage";
import { api } from "../services/api";

interface HomeScreenProps {
  onNavigate: (screen: ActiveScreen) => void;
  user: UserProfile | null;
  onRefreshUser: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate, user, onRefreshUser }) => {
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [couchbaseOk, setCouchbaseOk] = useState<boolean>(false);

  useEffect(() => {
    checkHealth();
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

  return (
    <View style={styles.container}>
      {/* Backend Status Badge */}
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
        <TouchableOpacity onPress={checkHealth} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Check</Text>
        </TouchableOpacity>
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
        </View>
      )}

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
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
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
