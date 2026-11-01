import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "../ui/EmptyState";
import AdminHeader from "../admin/AdminHeader";
import ActivityRow from "../admin/ActivityRow";
import PrimaryButton from "../ui/PrimaryButton";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { getActivityLogs, getAdminStats } from "../../services/adminService";


const STATISTICS = [
  { key: "totalUsers", label: "Total Users" },
  { key: "totalSessions", label: "Total Practice Sessions" },
  { key: "totalRecordings", label: "Total Recording Attempts" },
  { key: "recentlyActiveUsers", label: "Recently Active Users" },
];

function getErrorState(error) {
  if (error?.code === "permission-denied") {
    return "forbidden";
  }

  if (
    error?.code === "unavailable" ||
    error?.code === "auth/network-request-failed"
  ) {
    return "offline";
  }

  return "error";
}

function formatMetric(value) {
  return value == null ? "Unavailable" : String(value);
}

function LoadingStatistics({ colors, typography, styles }) {
  return (
    <View
      accessible
      accessibilityLabel="Loading dashboard statistics"
      accessibilityState={{ busy: true }}
      style={styles.statisticsGrid}
    >
      {STATISTICS.map((statistic) => (
        <View key={statistic.key} style={styles.statisticCell}>
          <View
            style={[
              styles.skeletonCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View
              style={[
                styles.skeletonLabel,
                { backgroundColor: colors.inputBackground },
              ]}
            />
            <View
              style={[
                styles.skeletonValue,
                { backgroundColor: colors.inputBackground },
              ]}
            />
            <Text style={[styles.loadingLabel, typography.body]}>Loading</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Statistics({ stats, styles }) {
  return (
    <View style={styles.statisticsGrid}>
      {STATISTICS.map((statistic) => {
        const subtitle =
          statistic.key === "recentlyActiveUsers"
            ? `Last ${formatMetric(stats.activityWindowDays)} days`
            : undefined;

        return (
          <View key={statistic.key} style={styles.statisticCell}>
            <StatCard
              admin
              label={statistic.label}
              value={formatMetric(stats[statistic.key])}
              subtitle={subtitle}
            />
          </View>
        );
      })}
    </View>
  );
}

function RecentActivity({ events, loading, styles, colors }) {
  if (loading) {
    return (
      <View
        style={styles.activityLoading}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading recent activity"
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!Array.isArray(events)) {
    return (
      <EmptyState
        icon="time-outline"
        title="Recent activity unavailable"
        description="Recent platform activity is not available right now."
      />
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title="No recent activity yet"
        description="Recent platform activity will appear here."
      />
    );
  }

  return (
    <View style={styles.activityList}>
      {events.slice(0, 5).map((event) => {
        const rowContent = (
          <>
            <View style={styles.activityText}>
              <ActivityRow
                event={event}
                userLabel={event.userName || "Unknown user"}
                userLabelStyle={styles.activityUser}
              />
            </View>
            {event.userId ? (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSecondary}
              />
            ) : null}
          </>
        );

        return event.userId ? (
          <TouchableOpacity
            key={event.id}
            accessibilityRole="button"
            accessibilityHint="Opens user details"
            style={styles.activityRow}
            onPress={() =>
              router.push({
                pathname: "/admin/users/[userId]",
                params: { userId: event.userId },
              })
            }
          >
            {rowContent}
          </TouchableOpacity>
        ) : (
          <View key={event.id} style={styles.activityRow}>
            {rowContent}
          </View>
        );
      })}
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { colors, typography } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const styles = getStyles(colors, typography, width < 360 || fontScale >= 1.3);
  const [stats, setStats] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [events, setEvents] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setStats(null);
    setLoadState("loading");
    setEvents(null);
    setActivityLoading(true);
    setRetryCount((count) => count + 1);
  }, []);

  useEffect(() => {
    let isCurrentRequest = true;

    getAdminStats()
      .then((result) => {
        if (isCurrentRequest) {
          setStats(result);
          setLoadState("success");
        }
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load admin dashboard statistics", error);
        }
        if (isCurrentRequest) {
          setLoadState(getErrorState(error));
        }
      });

    // Activity has its own response and must not block the statistics request.
    // The callable returns the first page in newest-first order.
    getActivityLogs({ type: "all", pageSize: 5, cursor: null })
      .then((result) => {
        if (isCurrentRequest) {
          setEvents(result.events);
          setActivityLoading(false);
        }
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load recent admin activity", error);
        }
        if (isCurrentRequest) {
          setEvents(null);
          setActivityLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [retryCount]);

  return (
    <ScreenContainer admin>
      <AdminHeader title="Dashboard" subtitle="Overview of SpeakSharp" />

      {loadState === "loading" ? (
        <LoadingStatistics
          colors={colors}
          typography={typography}
          styles={styles}
        />
      ) : null}

      {loadState === "success" ? (
        <>
          <Statistics stats={stats} styles={styles} />
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View all activity"
              style={styles.textAction}
              onPress={() => router.push("/admin/activity")}
            >
              <Text style={styles.textActionLabel}>View All</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.accent}
              />
            </TouchableOpacity>
          </View>
          <RecentActivity
            events={events}
            loading={activityLoading}
            styles={styles}
            colors={colors}
          />
          <PrimaryButton admin
            label="View All Users"
            icon="people-outline"
            onPress={() => router.push("/admin/users")}
            style={styles.usersButton}
          />
        </>
      ) : null}

      {loadState === "offline" ? (
        <View
          style={styles.offlineBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.offlineMessage}>
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={colors.navy}
            />
            <Text style={styles.offlineText}>
              Admin information requires an internet connection.
            </Text>
          </View>
          <PrimaryButton admin label="Retry" onPress={retry} style={styles.retryButton} />
        </View>
      ) : null}

      {loadState === "error" ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Couldn’t load dashboard"
          description="Dashboard statistics are unavailable right now. Try again."
          actionLabel="Retry"
          onAction={retry}
        />
      ) : null}

      {loadState === "forbidden" ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Access Denied"
          description="You don’t have permission to view dashboard information."
        />
      ) : null}

      {loadState === "success" ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh dashboard statistics"
          style={styles.refreshButton}
          onPress={retry}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.accent} />
          <Text style={styles.refreshLabel}>Refresh</Text>
        </TouchableOpacity>
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(colors, typography, singleColumn) {
  return StyleSheet.create({
    statisticsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.md,
    },
    statisticCell: {
      width: singleColumn ? "100%" : "50%",
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.sm,
    },
    skeletonCard: {
      minHeight: 152,
      alignItems: "flex-start",
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    skeletonLabel: {
      width: "78%",
      height: 12,
      borderRadius: radius.pill,
      marginTop: spacing.xs,
    },
    skeletonValue: {
      width: "40%",
      height: 24,
      borderRadius: radius.sm,
      marginTop: spacing.sm,
    },
    loadingLabel: {
      marginTop: spacing.xs,
      fontSize: 11,
    },
    sectionHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.heading,
      fontSize: 18,
      flexShrink: 1,
    },
    textAction: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    textActionLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
    activityList: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    activityLoading: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    activityText: {
      flex: 1,
      minWidth: 0,
    },
    activityUser: {
      color: colors.navy,
      fontSize: 14,
      fontWeight: "700",
    },
    usersButton: {
      marginTop: spacing.md,
    },
    offlineBanner: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
    },
    offlineMessage: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    offlineText: {
      flex: 1,
      color: colors.navy,
      fontSize: 14,
      lineHeight: 20,
    },
    retryButton: {
      marginTop: spacing.sm,
    },
    refreshButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    refreshLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
  });
}
