import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "../ui/EmptyState";
import { useFocusEffect } from "expo-router";
import PrimaryButton from "../ui/PrimaryButton";
import ScreenContainer from "../ui/ScreenContainer";
import ActivityRow from "../admin/ActivityRow";
import AdminHeader from "../admin/AdminHeader";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { getActivityLogs } from "../../services/adminService";

const PAGE_SIZE = 20;

// `value` is what adminService.getActivityLogs expects for `type`.
const TYPE_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Sessions", value: "sessions" },
  { label: "Recordings", value: "recordings" },
  { label: "Analysis", value: "analysis" },
  { label: "Errors", value: "errors" },
  { label: "Admin", value: "Admin" },
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

function displayValue(value) {
  return value == null || value === "" ? "—" : String(value);
}

function OnlineRequiredBanner({ onRetry, styles, colors }) {
  return (
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
      <PrimaryButton label="Retry" onPress={onRetry} style={styles.retryButton} />
    </View>
  );
}

export default function AdminActivityScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const params = useLocalSearchParams();

  // Optional user filter, passed as a route param (e.g. from User Details).
  const rawUserId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;
  const userId = rawUserId || null;

  const [type, setType] = useState("all");
  const [events, setEvents] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [retryCount, setRetryCount] = useState(0);
  const requestIdRef = useRef(0);

  const hasFilters = type !== "all" || Boolean(userId);

  // New filter, new user filter or refresh: reset results and fetch page 1.
  useEffect(() => {
    const requestId = ++requestIdRef.current;

    setEvents([]);
    setNextCursor(null);
    setLoadState("loading");
    setLoadMoreState("idle");

    getActivityLogs({
      type,
      userId: userId || undefined,
      pageSize: PAGE_SIZE,
      cursor: null,
    })
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setEvents(Array.isArray(result.events) ? result.events : []);
        setNextCursor(result.nextCursor ?? null);
        setLoadState("success");
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load admin activity", error);
        }
        if (requestId === requestIdRef.current) {
          setLoadState(getErrorState(error));
        }
      });

    return () => {
      if (requestId === requestIdRef.current) {
        requestIdRef.current += 1;
      }
    };
  }, [type, userId, retryCount]);

  const refresh = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") {
      return;
    }

    const requestId = requestIdRef.current;
    setLoadMoreState("loading");

    getActivityLogs({
      type,
      userId: userId || undefined,
      pageSize: PAGE_SIZE,
      cursor: nextCursor,
    })
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setEvents((current) => {
          const seen = new Set(current.map((event) => event.id));
          const fresh = (result.events ?? []).filter(
            (event) => !seen.has(event.id),
          );
          return [...current, ...fresh];
        });
        setNextCursor(result.nextCursor ?? null);
        setLoadMoreState("idle");
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load the next page of activity", error);
        }
        if (requestId === requestIdRef.current) {
          setLoadMoreState(getErrorState(error));
        }
      });
  }, [loadMoreState, nextCursor, type, userId]);

  const retryMore = useCallback(() => {
    setLoadMoreState("idle");
    loadMore();
  }, [loadMore]);

  const clearUserFilter = useCallback(() => {
    // An empty string removes the filter; `userId` above treats "" as none.
    router.setParams({ userId: "" });
  }, []);

  const clearFilters = useCallback(() => {
    setType("all");
    if (userId) {
      clearUserFilter();
    }
  }, [clearUserFilter, userId]);

  const goToUser = useCallback((targetUserId) => {
    router.push({
      pathname: "/admin/users/[userId]",
      params: { userId: targetUserId },
    });
  }, []);

  // Show a name, never the raw UID.
  const filteredUserName = userId
    ? events.find((event) => event.userName)?.userName || "this user"
    : null;

  const showInitialError = loadState === "error" || loadState === "forbidden";
  const isOffline = loadState === "offline" || loadMoreState === "offline";
  const hasNoEvents = loadState === "success" && events.length === 0;

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <AdminHeader title="Activity" />
      </View>

      <Text style={styles.note}>
        Shows recorded system activity, not live microphone monitoring.
      </Text>

      {__DEV__ ? (
        <View style={styles.demoNotice} accessibilityRole="text">
          <Ionicons name="flask-outline" size={16} color={colors.accent} />
          <Text style={styles.demoNoticeText}>Demo Data</Text>
        </View>
      ) : null}

      <Text accessibilityRole="text" style={styles.filterLabel}>
        Filter activity by event type
      </Text>
      <View style={styles.chips}>
        {TYPE_OPTIONS.map((option) => {
          const selected = option.value === type;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Filter activity: ${option.label}`}
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setType(option.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelActive]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {userId ? (
        <View style={styles.userFilter}>
          <Text style={styles.userFilterText} numberOfLines={2}>
            Showing activity for {displayValue(filteredUserName)}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear user filter"
            style={styles.clearButton}
            onPress={clearUserFilter}
          >
            <Text style={styles.clearLabel}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isOffline ? (
        <OnlineRequiredBanner
          onRetry={loadState === "offline" ? refresh : retryMore}
          styles={styles}
          colors={colors}
        />
      ) : null}

      {loadState === "loading" ? (
        <View
          style={styles.loading}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading activity"
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading activity</Text>
        </View>
      ) : null}

      {hasNoEvents ? (
        <EmptyState
          icon="time-outline"
          title={type === "Admin" ? "No admin actions recorded." : "No activity"}
          description={
            type === "Admin"
              ? "No admin actions have been recorded yet."
              : "No matching events were recorded. This doesn’t mean users did nothing."
          }
          actionLabel={hasFilters ? "Clear Filters" : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      ) : null}

      {showInitialError ? (
        <EmptyState
          icon={
            loadState === "forbidden"
              ? "lock-closed-outline"
              : "alert-circle-outline"
          }
          title={
            loadState === "forbidden"
              ? "Access Denied"
              : "Couldn’t load activity"
          }
          description={
            loadState === "forbidden"
              ? "You don’t have permission to view admin activity."
              : "The activity feed is unavailable right now. Try again."
          }
          actionLabel={loadState === "forbidden" ? "Back to Home" : "Retry"}
          onAction={
            loadState === "forbidden" ? () => router.replace("/home") : refresh
          }
        />
      ) : null}

      {loadState === "success" && events.length > 0 ? (
        <View style={styles.list}>
          {events.map((event) => (
            <TouchableOpacity
              key={event.id}
              accessibilityRole="button"
              accessibilityHint={event.userId ? "Opens user details" : undefined}
              accessibilityState={{ disabled: !event.userId }}
              disabled={!event.userId}
              onPress={() => event.userId && goToUser(event.userId)}
              activeOpacity={0.75}
              style={styles.item}
            >
              <Text style={styles.userName}>
                {displayValue(event.userName)}
              </Text>
              <ActivityRow event={event} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loadMoreState === "forbidden" ? (
        <View style={styles.footerError} accessibilityRole="alert">
          <Text style={styles.footerErrorText}>
            Access to more activity was denied.
          </Text>
        </View>
      ) : null}

      {loadMoreState === "error" ? (
        <View style={styles.footerError} accessibilityRole="alert">
          <Text style={styles.footerErrorText}>
            Couldn’t load more activity.
          </Text>
          <PrimaryButton
            label="Retry"
            onPress={retryMore}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      {loadMoreState === "loading" ? (
        <View
          style={styles.footerLoading}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading more activity"
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading more activity</Text>
        </View>
      ) : null}

      {loadState === "success" &&
      events.length > 0 &&
      nextCursor &&
      loadMoreState === "idle" ? (
        <PrimaryButton
          label="Load More"
          onPress={loadMore}
          style={styles.loadMoreButton}
        />
      ) : null}

      {loadState === "success" ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh activity"
          style={styles.refreshButton}
          onPress={refresh}
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
    headerSpacing: {
      marginBottom: spacing.sm,
    },
    note: {
      ...typography.body,
      marginBottom: spacing.md,
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
    filterLabel: {
      color: colors.navySoft,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    // Same look as FilterTabs, wrapping options to fit on a phone.
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
    },
    chipActive: {
      backgroundColor: colors.accent,
      shadowColor: "#101828",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    chipLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navySoft,
    },
    chipLabelActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    userFilter: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingLeft: spacing.smd,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    userFilterText: {
      flex: 1,
      color: colors.navy,
      fontSize: 14,
      fontWeight: "600",
      paddingVertical: spacing.sm,
    },
    clearButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.smd,
    },
    clearLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
    loading: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    list: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    item: {
      paddingTop: spacing.smd,
    },
    userName: {
      color: colors.navy,
      fontSize: 14,
      fontWeight: "700",
    },
    loadMoreButton: {
      marginTop: spacing.md,
    },
    footerLoading: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    footerError: {
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    footerErrorText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: "center",
    },
    footerButton: {
      minWidth: 140,
      marginTop: spacing.xs,
    },
    offlineBanner: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
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