import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Header } from "../components/Header";
import { UserProfile, AttendanceRecord } from "../types";
import { storageService } from "../services/storage";
import { api } from "../services/api";

interface HistoryScreenProps {
  user: UserProfile | null;
  onBack: () => void;
  onNavigateToVerify?: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  user,
  onBack,
  onNavigateToVerify,
}) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCachedAndFetch();
  }, [user?.id]);

  const loadCachedAndFetch = async () => {
    // 1. Immediately show cached records for instantaneous offline UI
    const cached = await storageService.getCachedAttendance();
    if (cached.length > 0) {
      setRecords(cached);
      setIsLoading(false);
    }

    // 2. Fetch fresh records from backend
    await fetchRemoteRecords();
  };

  const fetchRemoteRecords = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      setErrorMsg(null);
      const remote = await api.getAttendanceHistory(user.id);
      setRecords(remote);
      await storageService.saveCachedAttendance(remote);
    } catch (err: any) {
      console.warn("[HistoryScreen] Remote fetch failed:", err.message);
      // If we don't even have cached records, show error
      if (records.length === 0) {
        setErrorMsg("Could not sync history with backend. Working offline.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRemoteRecords();
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    if (records.length === 0) {
      return { totalDays: 0, thisMonth: 0, avgScore: 0 };
    }

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthCount = records.filter((r) => r.date.startsWith(currentMonthPrefix)).length;

    const totalScore = records.reduce((sum, r) => sum + (r.similarityScore || 0), 0);
    const avgScore = Math.round((totalScore / records.length) * 100);

    return {
      totalDays: records.length,
      thisMonth: thisMonthCount,
      avgScore,
    };
  }, [records]);

  // Format pure calendar date (YYYY-MM-DD): no timezone shifting
  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const [year, month, day] = parts;
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    return dateStr;
  };

  // Format check-in time from server UTC timestamp converted to user's local timezone
  const formatTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: user?.timezone || undefined,
      });
    } catch {
      return isoStr.slice(11, 19);
    }
  };

  const renderAttendanceItem = ({ item }: { item: AttendanceRecord }) => (
    <View style={styles.recordCard}>
      <View style={styles.cardHeaderRow}>
        <View>
          <Text style={styles.recordDate}>{formatDate(item.date)}</Text>
          <Text style={styles.recordTime}>Checked in at {formatTime(item.serverTimestamp)}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>PRESENT</Text>
        </View>
      </View>

      <View style={styles.cardFooterRow}>
        <View style={styles.matchScorePill}>
          <Text style={styles.matchScoreText}>
            {(item.similarityScore * 100).toFixed(1)}% Match
          </Text>
        </View>
        <Text style={styles.verifiedText}>✓ On-Device Verified</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Header Row with Back Button */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Header
          title="Attendance History"
          subtitle={user ? `${user.name} (${user.id})` : "Personal Logs"}
        />
      </View>

      {/* Summary Metrics Bar */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>{metrics.totalDays}</Text>
          <Text style={styles.metricLabel}>Total Days</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>{metrics.thisMonth}</Text>
          <Text style={styles.metricLabel}>This Month</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>{metrics.avgScore > 0 ? `${metrics.avgScore}%` : "—"}</Text>
          <Text style={styles.metricLabel}>Avg Match</Text>
        </View>
      </View>

      {/* Offline Notice if applicable */}
      {errorMsg && (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>⚠️ {errorMsg}</Text>
        </View>
      )}

      {/* List or Loading / Empty state */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading attendance records...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>No Attendance Records</Text>
          <Text style={styles.emptyText}>
            You haven't marked attendance yet. Once you verify your face, your daily attendance logs will appear here.
          </Text>
          {onNavigateToVerify && (
            <TouchableOpacity style={styles.primaryBtn} onPress={onNavigateToVerify}>
              <Text style={styles.primaryBtnText}>Mark Today's Attendance</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id || `att-${item.date}`}
          renderItem={renderAttendanceItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#38BDF8"
              colors={["#38BDF8"]}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topRow: {
    marginBottom: 4,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    marginBottom: 10,
  },
  backBtnText: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  metricNumber: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "800",
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  offlineNotice: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    borderWidth: 1,
    borderColor: "#EAB308",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  offlineNoticeText: {
    color: "#FDE047",
    fontSize: 12,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  recordCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  recordDate: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  recordTime: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  statusBadgeText: {
    color: "#4ADE80",
    fontSize: 12,
    fontWeight: "700",
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.5)",
    paddingTop: 10,
  },
  matchScorePill: {
    backgroundColor: "#0F172A",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  matchScoreText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600",
  },
  verifiedText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
