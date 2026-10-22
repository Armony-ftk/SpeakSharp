import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ActivityRow from "../admin/ActivityRow";
import StatusBadge from "../admin/StatusBadge";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import PrimaryButton from "../ui/PrimaryButton";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  getUserDetails,
  setUserDisabled,
} from "../../services/adminService";

function getErrorState(error) {
  if (error?.code === "not-found") {
    return "not-found";
  }
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

function formatCreatedAt(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function BackButton({ colors, styles }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.backButton}
      onPress={() => router.back()}
      hitSlop={8}
    >
      <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      <Text style={styles.backLabel}>Back</Text>
    </TouchableOpacity>
  );
}

function LoadingDetails({ colors, typography, styles }) {
  return (
    <View
      style={styles.loading}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading user details"
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={[typography.body, styles.loadingText]}>
        Loading user details
      </Text>
    </View>
  );
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

export default function AdminUserDetailsScreen({ userId }) {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const [user, setUser] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [actionForbidden, setActionForbidden] = useState(false);
  const requestIdRef = useRef(0);
  const actionPendingRef = useRef(false);
  const actionRequestIdRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    actionRequestIdRef.current += 1;
    actionPendingRef.current = false;
    setUser(null);
    setLoadState("loading");
    setShowConfirmation(false);
    setIsSavingStatus(false);
    setActionError("");
    setSuccessMessage("");
    setIsOffline(false);
    setActionForbidden(false);

    if (!userId) {
      setLoadState("not-found");
      return () => {
        requestIdRef.current += 1;
      };
    }

    getUserDetails(userId)
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setUser(result);
        setLoadState("success");
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load admin user details", error);
        }
        if (requestId === requestIdRef.current) {
          const state = getErrorState(error);
          setLoadState(state);
          setIsOffline(state === "offline");
        }
      });

    return () => {
      if (requestId === requestIdRef.current) {
        requestIdRef.current += 1;
      }
    };
  }, [userId, retryCount]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      actionPendingRef.current = false;
    },
    [],
  );

  const retry = useCallback(() => {
    setActionError("");
    setSuccessMessage("");
    setLoadState("loading");
    setRetryCount((count) => count + 1);
  }, []);

  const goBack = useCallback(() => {
    router.back();
  }, []);

  const isSuspended = user?.accountStatus === "suspended";
  const canManageAccount =
    loadState === "success" &&
    !isOffline &&
    !actionForbidden &&
    (user?.accountStatus === "active" || isSuspended);

  const openConfirmation = useCallback(() => {
    if (actionPendingRef.current || !canManageAccount) {
      return;
    }
    setActionError("");
    setSuccessMessage("");
    setShowConfirmation(true);
  }, [canManageAccount]);

  const cancelConfirmation = useCallback(() => {
    if (!actionPendingRef.current) {
      setShowConfirmation(false);
    }
  }, []);

  const confirmAccountChange = useCallback(async () => {
    if (actionPendingRef.current || !user || !canManageAccount) {
      return;
    }

    actionPendingRef.current = true;
    const actionRequestId = ++actionRequestIdRef.current;
    setIsSavingStatus(true);
    setActionError("");
    setSuccessMessage("");

    const shouldDisable = user.accountStatus === "active";

    try {
      const result = await setUserDisabled(userId, shouldDisable);
      if (
        actionRequestId !== actionRequestIdRef.current ||
        activeUserIdRef.current !== userId
      ) {
        return;
      }
      setUser((currentUser) => ({
        ...currentUser,
        accountStatus: result.accountStatus,
      }));
      setSuccessMessage(
        result.accountStatus === "suspended"
          ? "Account suspended."
          : "Account reactivated.",
      );
      setIsOffline(false);
      setShowConfirmation(false);
    } catch (error) {
      if (__DEV__) {
        console.warn("Could not update admin user account status", error);
      }
      if (
        actionRequestId !== actionRequestIdRef.current ||
        activeUserIdRef.current !== userId
      ) {
        return;
      }
      const state = getErrorState(error);
      if (state === "offline") {
        setIsOffline(true);
      }
      if (state === "forbidden") {
        setActionForbidden(true);
      }
      setActionError(
        state === "offline"
          ? "Admin information requires an internet connection. The account status was not changed."
          : state === "forbidden"
            ? "Access denied. The account status was not changed."
            : "Couldn’t update account status. The previous status is unchanged.",
      );
      setShowConfirmation(false);
    } finally {
      if (actionRequestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setIsSavingStatus(false);
      }
    }
  }, [canManageAccount, user, userId]);

  const accountActionLabel = isSuspended
    ? "Reactivate Account"
    : "Suspend Account";
  const confirmationTitle = isSuspended
    ? `Reactivate ${displayValue(user?.fullName)}?`
    : `Suspend ${displayValue(user?.fullName)}?`;
  const confirmationMessage = isSuspended
    ? "This will allow them to sign in and use their account again."
    : "They won’t be able to sign in until reactivated.";

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton colors={colors} styles={styles} />
        <Text style={styles.title}>User Details</Text>
      </View>

      {__DEV__ ? (
        <View style={styles.demoNotice} accessibilityRole="text">
          <Ionicons name="flask-outline" size={16} color={colors.accent} />
          <Text style={styles.demoNoticeText}>Demo Data</Text>
        </View>
      ) : null}

      {loadState === "loading" ? (
        <LoadingDetails
          colors={colors}
          typography={typography}
          styles={styles}
        />
      ) : null}

      {loadState === "offline" ? (
        <OnlineRequiredBanner
          onRetry={retry}
          styles={styles}
          colors={colors}
        />
      ) : null}

      {loadState === "error" ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Couldn’t load user details"
          description="User information is unavailable right now. Try again."
          actionLabel="Retry"
          onAction={retry}
        />
      ) : null}

      {loadState === "forbidden" ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Access Denied"
          description="You don’t have permission to view this user’s information."
        />
      ) : null}

      {loadState === "not-found" ? (
        <EmptyState
          icon="person-outline"
          title="User not found"
          description="This user may no longer be available."
          actionLabel="Back"
          onAction={goBack}
        />
      ) : null}

      {loadState === "success" && user ? (
        <>
          <View style={styles.profileCard}>
            <Text style={styles.fullName}>{displayValue(user.fullName)}</Text>
            <Text style={styles.email}>{displayValue(user.email)}</Text>
            <StatusBadge status={user.accountStatus} />
            <Text style={styles.createdAt}>
              Account created: {formatCreatedAt(user.createdAt)}
            </Text>
          </View>

          <View style={styles.stats}>
            <View style={styles.statCell}>
              <StatCard
                label="Total Sessions"
                value={displayValue(user.totalSessions)}
              />
            </View>
            <View style={styles.statCell}>
              <StatCard
                label="Total Recordings"
                value={displayValue(user.totalRecordings)}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {Array.isArray(user.recentActivity) &&
          user.recentActivity.length > 0 ? (
            <View style={styles.activityList}>
              {user.recentActivity.slice(0, 5).map((event, index) => (
                <ActivityRow
                  key={event.id ?? `activity-${index}`}
                  event={event}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="time-outline"
              title="No recent activity"
              description="There are no recorded activity events for this user."
            />
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View user activity"
            accessibilityHint="Opens the activity feed filtered to this user"
            style={styles.viewActivityButton}
            onPress={() =>
              router.push({
                pathname: "/admin/activity",
                params: { userId },
              })
            }
          >
            <Text style={styles.viewActivityLabel}>View user activity</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </TouchableOpacity>

          {isOffline ? (
            <OnlineRequiredBanner
              onRetry={retry}
              styles={styles}
              colors={colors}
            />
          ) : null}

          {actionError ? (
            <Text
              style={styles.actionError}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {actionError}
            </Text>
          ) : null}
          {successMessage ? (
            <Text
              style={styles.successMessage}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {successMessage}
            </Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={accountActionLabel}
            accessibilityState={{
              disabled: !canManageAccount || isSavingStatus,
              busy: isSavingStatus,
            }}
            style={[
              styles.accountAction,
              isSuspended && styles.reactivateAction,
              (!canManageAccount || isSavingStatus) && styles.actionDisabled,
            ]}
            onPress={openConfirmation}
            disabled={!canManageAccount || isSavingStatus}
            activeOpacity={0.8}
          >
            {isSavingStatus ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.accountActionText}>Updating…</Text>
              </>
            ) : (
              <Text style={styles.accountActionText}>{accountActionLabel}</Text>
            )}
          </TouchableOpacity>
        </>
      ) : null}

      <ConfirmDialog
        visible={showConfirmation}
        title={confirmationTitle}
        message={confirmationMessage}
        cancelLabel="Cancel"
        confirmLabel={isSuspended ? "Reactivate" : "Suspend"}
        destructive={!isSuspended}
        loading={isSavingStatus}
        onCancel={cancelConfirmation}
        onConfirm={confirmAccountChange}
      />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    backButton: {
      minWidth: 48,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    backLabel: {
      color: colors.navySoft,
      fontSize: 14,
      fontWeight: "600",
    },
    title: {
      ...typography.heading,
      flexShrink: 1,
      fontSize: 20,
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
    loading: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    loadingText: {
      textAlign: "center",
    },
    profileCard: {
      alignItems: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    fullName: {
      ...typography.heading,
      fontSize: 20,
      flexShrink: 1,
    },
    email: {
      ...typography.body,
      fontSize: 15,
      flexShrink: 1,
    },
    createdAt: {
      ...typography.body,
      marginTop: spacing.xs,
    },
    stats: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -spacing.xs,
      marginBottom: spacing.md,
    },
    statCell: {
      width: "50%",
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.heading,
      fontSize: 18,
      marginBottom: spacing.sm,
    },
    activityList: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    viewActivityButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    viewActivityLabel: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
    actionError: {
      color: "#D92D20",
      fontSize: 14,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    successMessage: {
      color: colors.success,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    accountAction: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: "#D92D20",
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.smd,
      marginTop: spacing.sm,
    },
    reactivateAction: {
      backgroundColor: colors.accent,
    },
    actionDisabled: {
      opacity: 0.55,
    },
    accountActionText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "700",
      textAlign: "center",
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
  });
}