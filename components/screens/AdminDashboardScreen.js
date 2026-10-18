import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "../ui/EmptyState";
import PrimaryButton from "../ui/PrimaryButton";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { getAdminStats } from "../../services/adminService";

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

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatMetric(value) {
  return value == null ? "—" : String(value);
}

function DashboardHeader({ styles, colors, isSignedIn }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Text style={styles.subtitle}>Overview of SpeakSharp</Text>
      </View>
      <View style={styles.headerActions}>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
        {isSignedIn ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open account settings and sign out"
            style={styles.settingsButton}
            onPress={() => router.push("/settings")}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.navy} />
            <Text style={styles.settingsButtonText}>Account / Sign Out</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
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

function RecentActivity({ events, styles, colors }) {
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
        const eventStatus =
          event.status === "failed"
            ? "Failed"
            : event.status === "success"
              ? "Completed"
              : "—";
        const rowContent = (
          <>
            <View style={styles.activityText}>
              <Text style={styles.activityUser}>
                {event.userName || "Unknown user"}
              </Text>
              <Text style={styles.activityLabel}>{event.label || "Activity"}</Text>
              <Text style={styles.activityTime}>
                {formatTimestamp(event.occurredAt)}
              </Text>
            </View>
            <View
              style={[
                styles.activityStatus,
                event.status === "failed" && styles.activityStatusFailed,
              ]}
            >
              <Text style={styles.activityStatusText}>{eventStatus}</Text>
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
            accessibilityLabel={`${event.userName || "User"}: ${event.label || "Activity"}, ${eventStatus}, ${formatTimestamp(event.occurredAt)}`}
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
  const { currentUser } = useAuth();
  const styles = getStyles(colors, typography);
  const [stats, setStats] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setStats(null);
    setLoadState("loading");
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

    return () => {
      isCurrentRequest = false;
    };
  }, [retryCount]);

  return (
    <ScreenContainer>
      <DashboardHeader
        styles={styles}
        colors={colors}
        isSignedIn={Boolean(currentUser)}
      />

      {__DEV__ ? (
        <View style={styles.demoNotice} accessibilityRole="text">
          <Ionicons name="flask-outline" size={16} color={colors.accent} />
          <Text style={styles.demoNoticeText}>Demo Data</Text>
        </View>
      ) : null}

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
            events={Array.isArray(stats.recentActivity) ? stats.recentActivity : []}
            styles={styles}
            colors={colors}
          />
          <PrimaryButton
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
          <PrimaryButton label="Retry" onPress={retry} style={styles.retryButton} />
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

function getStyles(colors, typography) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    title: {
      ...typography.heading,
      fontSize: 22,
    },
    subtitle: {
      ...typography.body,
      marginTop: spacing.xs,
    },
    headerActions: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    adminBadge: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    adminBadgeText: {
      color: colors.navySoft,
      fontSize: 12,
      fontWeight: "700",
    },
    settingsButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    settingsButtonText: {
      color: colors.navy,
      fontSize: 12,
      fontWeight: "600",
    },
    demoNotice: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.smd,
      paddingVertical: spacing.xs,
      marginBottom: spacing.md,
    },
    demoNoticeText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "700",
    },
    statisticsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.md,
    },
    statisticCell: {
      width: "50%",
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.sm,
    },
    skeletonCard: {
      minHeight: 105,
      alignItems: "center",
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
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.heading,
      fontSize: 18,
    },
    textAction: {
      minHeight: 40,
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
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.smd,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    activityText: {
      flex: 1,
      gap: spacing.xs,
    },
    activityUser: {
      color: colors.navy,
      fontSize: 14,
      fontWeight: "700",
    },
    activityLabel: {
      color: colors.navySoft,
      fontSize: 13,
    },
    activityTime: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    activityStatus: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    activityStatusFailed: {
      borderColor: "#D92D20",
    },
    activityStatusText: {
      color: colors.navySoft,
      fontSize: 11,
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
