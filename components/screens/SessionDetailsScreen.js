import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import EmptyState from "../ui/EmptyState";
import ActionSheet from "../ui/ActionSheet";
import ConfirmDialog from "../ui/ConfirmDialog";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  deleteSession,
  getSessionById,
  getSessionErrorMessage,
  updateSession,
} from "../../services/sessionService";

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatPresentationDate(value) {
  if (!value) return "No presentation date";
  const date = typeof value.toDate === "function" ? value.toDate() : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "No presentation date";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDuration(seconds) {
  if (!seconds) return "No target";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function SessionDetailsScreen() {
  const params = useLocalSearchParams();
  const id = firstParam(params.id);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showDeleteSession, setShowDeleteSession] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const loadSession = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const loadedSession = await getSessionById(id);
      setSession(loadedSession);
      if (!loadedSession) setErrorMessage("This session no longer exists.");
    } catch (error) {
      setErrorMessage(getSessionErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [loadSession]),
  );

  const isCompleted = session?.status === "completed";
  const nextStatus = isCompleted ? "active" : "completed";

  const handleStatusChange = async () => {
    if (!session || updatingStatus) return;
    setUpdatingStatus(true);
    setErrorMessage("");
    try {
      await updateSession(id, { status: nextStatus });
      setSession((current) => ({ ...current, status: nextStatus }));
      setShowStatusConfirm(false);
    } catch (error) {
      setErrorMessage(getSessionErrorMessage(error));
      setShowStatusConfirm(false);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteSession = async () => {
    if (deleting) return;
    setDeleting(true);
    setErrorMessage("");
    try {
      await deleteSession(id);
      setShowDeleteSession(false);
      router.replace("/sessions");
    } catch (error) {
      setErrorMessage(getSessionErrorMessage(error));
      setShowDeleteSession(false);
      setDeleting(false);
    }
  };

  if (loading && !session) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </ScreenContainer>
    );
  }

  if (!session) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <EmptyState
          icon="alert-circle-outline"
          title="Session unavailable"
          description={errorMessage || "This session could not be found."}
          actionLabel="BACK TO SESSIONS"
          onAction={() => router.replace("/sessions")}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {session.title}
        </Text>
        <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={8}>
          <Ionicons
            name="ellipsis-vertical"
            size={20}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <Ionicons
          name={isCompleted ? "checkmark-circle" : "ellipse"}
          size={14}
          color={isCompleted ? colors.success : colors.accent}
        />
        <Text
          style={[
            styles.statusText,
            isCompleted && styles.completedStatusText,
          ]}
        >
          {isCompleted ? "Completed" : "Active"}
        </Text>
      </View>

      <Text style={styles.headerSubtitle}>
        {formatPresentationDate(session.presentationDate)} • Target: {" "}
        {formatDuration(session.targetDurationSeconds)}
      </Text>

      {session.context ? (
        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>About this presentation</Text>
          <Text style={styles.contextText}>{session.context}</Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard value={session.attemptCount ?? 0} label="Attempts" />
        <StatCard
          value={
            session.latestRating != null
              ? session.latestRating.toFixed(1)
              : "--"
          }
          label="Latest Rating"
        />
        <StatCard
          value={
            session.bestRating != null ? session.bestRating.toFixed(1) : "--"
          }
          label="Best Rating"
          valueColor={colors.success}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <EmptyState
        icon="mic-outline"
        title="No recordings to show"
        description="Recording attempts will appear here in the next milestone."
      />

      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Session options"
        actions={[
          {
            label: "Edit session",
            icon: "create-outline",
            onPress: () =>
              router.push({
                pathname: "/create-session",
                params: { sessionId: id },
              }),
          },
          {
            label: isCompleted ? "Reopen session" : "Mark as completed",
            icon: isCompleted ? "refresh-outline" : "checkmark-circle-outline",
            onPress: () => setShowStatusConfirm(true),
          },
          {
            label: "Delete session",
            icon: "trash-outline",
            destructive: true,
            onPress: () => setShowDeleteSession(true),
          },
        ]}
      />

      <ConfirmDialog
        visible={showStatusConfirm}
        title={isCompleted ? "Reopen this session?" : "Mark session as completed?"}
        message={
          isCompleted
            ? "This session will return to your active sessions."
            : "You can reopen this session later if you want to continue practising."
        }
        confirmLabel={
          updatingStatus
            ? "SAVING..."
            : isCompleted
              ? "Reopen Session"
              : "Mark Complete"
        }
        loading={updatingStatus}
        onCancel={() => setShowStatusConfirm(false)}
        onConfirm={handleStatusChange}
      />

      <ConfirmDialog
        visible={showDeleteSession}
        title="Delete Practice Session?"
        message={`"${session.title}" and any related recordings will be permanently deleted.`}
        confirmLabel={deleting ? "DELETING..." : "DELETE SESSION"}
        destructive
        loading={deleting}
        onCancel={() => setShowDeleteSession(false)}
        onConfirm={handleDeleteSession}
      />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    centeredContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    loadingText: {
      ...typography.body,
      textAlign: "center",
      marginTop: spacing.sm,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    headerTitle: {
      ...typography.heading,
      fontSize: 20,
      flex: 1,
      marginHorizontal: spacing.sm,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.xs,
    },
    statusText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent,
      marginLeft: spacing.xs,
    },
    completedStatusText: {
      color: colors.success,
    },
    headerSubtitle: {
      ...typography.body,
      fontSize: 15,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    contextCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    contextLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    contextText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.navySoft,
    },
    statsRow: {
      flexDirection: "row",
      gap: spacing.smd,
      marginBottom: spacing.lg,
    },
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
  });
}
