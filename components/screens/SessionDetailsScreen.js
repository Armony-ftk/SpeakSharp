import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import ComparisonRow from "../ui/ComparisonRow";
import PrimaryButton from "../ui/PrimaryButton";
import AttemptListItem from "../ui/AttemptListItem";
import EmptyState from "../ui/EmptyState";
import ActionSheet from "../ui/ActionSheet";
import ConfirmDialog from "../ui/ConfirmDialog";
import {
  getSession,
  updateSession,
  deleteSession,
} from "../../constants/mockSessions";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function SessionDetailsScreen() {
  const { id } = useLocalSearchParams();
  const [session, setSession] = useState(() => getSession(id));
  const [showMenu, setShowMenu] = useState(false);
  const [showMarkComplete, setShowMarkComplete] = useState(false);
  const [showDeleteSession, setShowDeleteSession] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const hasAttempts = session.attempts > 0;
  const isCompleted = session.status === "Completed";

  const handleMarkComplete = () => {
    setSession(updateSession(id, { status: "Completed" }));
    setShowMarkComplete(false);
  };

  const handleDeleteSession = () => {
    deleteSession(id);
    setShowDeleteSession(false);
    router.replace("/sessions");
  };

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

      {isCompleted ? (
        <View style={styles.completedRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.completedText}>Completed</Text>
        </View>
      ) : (
        <Text style={styles.headerSubtitle}>
          {session.status} • {session.date} • Target: {session.targetMinutes}{" "}
          min
        </Text>
      )}

      {isCompleted ? (
        <View style={styles.completedStats}>
          <Text style={styles.completedStatLine}>
            Final rating{" "}
            {session.latestScore != null
              ? session.latestScore.toFixed(1)
              : "--"}{" "}
            / 10
          </Text>
          <Text style={styles.completedStatLine}>
            Best rating{" "}
            {session.bestScore != null ? session.bestScore.toFixed(1) : "--"} /
            10
          </Text>
          <Text style={styles.completedStatLine}>
            Attempts {session.attempts}
          </Text>
        </View>
      ) : (
        <View style={styles.statsRow}>
          <StatCard value={session.attempts} label="Attempts" />
          <StatCard
            value={
              session.latestScore != null
                ? session.latestScore.toFixed(1)
                : "--"
            }
            label="Latest Score"
          />
          <StatCard
            value={
              session.bestScore != null ? session.bestScore.toFixed(1) : "--"
            }
            label="Best Score"
            valueColor={colors.success}
          />
        </View>
      )}

      {hasAttempts ? (
        <>
          <Text style={styles.sectionTitle}>Your Improvement</Text>
          <View style={styles.improvementCard}>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>Overall Rating Shift</Text>
              <View style={styles.ratingValueRow}>
                <Text style={styles.ratingValue}>
                  {session.ratingFrom.toFixed(1)} →{" "}
                  {session.ratingTo.toFixed(1)}
                </Text>
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingPillText}>
                    {session.ratingDelta}
                  </Text>
                </View>
              </View>
            </View>

            {session.improvements.map((item) => (
              <ComparisonRow
                key={item.label}
                label={item.label}
                meta={item.meta}
                beforeLabel={item.before}
                afterLabel={item.after}
              />
            ))}
          </View>

          {isCompleted ? (
            <PrimaryButton
              label="VIEW FINAL FEEDBACK"
              pill
              onPress={() =>
                router.push(`/session/${id}/attempt?view=feedback`)
              }
            />
          ) : (
            <PrimaryButton
              label="RECORD NEW ATTEMPT"
              icon="mic"
              pill
              onPress={() => router.push(`/session/${id}/attempt`)}
            />
          )}

          <Text style={styles.sectionTitle}>Previous Attempts</Text>
          {session.previousAttempts.map((attempt) => (
            <AttemptListItem
              key={attempt.number}
              number={attempt.number}
              title={attempt.title}
              timestamp={attempt.timestamp}
              onPress={() => {}}
            />
          ))}
        </>
      ) : (
        <EmptyState
          icon="mic-outline"
          title="No attempts yet"
          description="Your first recording will appear here."
          actionLabel="RECORD FIRST ATTEMPT"
          onAction={() => router.push(`/session/${id}/attempt`)}
        />
      )}

      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Session options"
        actions={[
          ...(!isCompleted
            ? [
                {
                  label: "Mark as completed",
                  icon: "checkmark-circle-outline",
                  onPress: () => setShowMarkComplete(true),
                },
              ]
            : []),
          {
            label: "Delete session",
            icon: "trash-outline",
            destructive: true,
            onPress: () => setShowDeleteSession(true),
          },
        ]}
      />

      <ConfirmDialog
        visible={showMarkComplete}
        title="Mark session as completed?"
        message="You can still view your previous attempts and feedback afterwards."
        confirmLabel="Mark Complete"
        onCancel={() => setShowMarkComplete(false)}
        onConfirm={handleMarkComplete}
      />

      <ConfirmDialog
        visible={showDeleteSession}
        title="Delete Practice Session?"
        message={`"${session.title}"\n\nThis will permanently delete:`}
        items={[
          `${session.attempts} recording attempts`,
          "Transcripts",
          "Speaking metrics",
          "AI feedback",
          "Ratings",
        ]}
        confirmLabel="DELETE SESSION"
        destructive
        onCancel={() => setShowDeleteSession(false)}
        onConfirm={handleDeleteSession}
      />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
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
    headerSubtitle: {
      ...typography.body,
      fontSize: 15,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    completedRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    completedText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.success,
      marginLeft: spacing.xs,
    },
    completedStats: {
      marginBottom: spacing.lg,
    },
    completedStatLine: {
      ...typography.body,
      color: colors.navySoft,
      marginBottom: 2,
    },
    statsRow: {
      flexDirection: "row",
      gap: spacing.sm + 4,
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.navy,
      marginBottom: spacing.md,
    },
    improvementCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginBottom: spacing.lg,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    ratingRow: {
      marginBottom: spacing.md,
    },
    ratingLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.navySoft,
      marginBottom: spacing.xs,
    },
    ratingValueRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    ratingValue: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.navy,
    },
    ratingPill: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
    },
    ratingPillText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
}
