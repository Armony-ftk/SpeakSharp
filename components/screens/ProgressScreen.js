import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import StatCard from "../ui/StatCard";
import ProgressMetricCard from "../ui/ProgressMetricCard";
import EmptyState from "../ui/EmptyState";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { useProgress } from "../../hooks/useProgress";
import { formatProgressRating, getProgressCards, getProgressMessage } from "../../utils/progressStats";

export default function ProgressScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const { progress, loading, errorMessage, retry } = useProgress();
  const { overview, eligibleCount, undatedCount } = progress;
  const improvements = getProgressCards(progress);

  if (loading || errorMessage || overview.attempts === 0) {
    return (
      <ScreenContainer contentStyle={styles.emptyContent}>
        <AppHeader />
        <View style={styles.emptyBody}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Loading your progress...</Text>
            </>
          ) : errorMessage ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Progress unavailable"
              description={errorMessage}
              actionLabel="TRY AGAIN"
              onAction={retry}
            />
          ) : (
            <EmptyState
              icon="trending-up-outline"
              title="Your progress starts here"
              description="Complete your first practice attempt to start tracking your improvement."
              actionLabel="START PRACTISING"
              onAction={() => router.push("/create-session")}
            />
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader />
      <Text style={styles.title}>Your Progress</Text>
      <Text style={styles.subtitle}>Track your communication journey.</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard value={overview.sessions} label="Sessions" />
          <StatCard value={overview.attempts} label="Attempts" />
        </View>
        <View style={styles.statsRow}>
          <StatCard value={formatProgressRating(overview.average)} label="Average" />
          <StatCard
            value={formatProgressRating(overview.best)}
            label="Best"
            valueColor={colors.success}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Your Improvement</Text>
      <Text style={styles.comparisonNote}>
        {eligibleCount < 4
          ? `Comparisons need 4 completed, rated attempts with recording dates (${eligibleCount}/4 available).`
          : "Latest 2 rated attempts compared with the previous 2. Filler words and pace are averages per attempt; each metric needs valid data for both attempts in both groups."}
        {undatedCount > 0 ? " Rated attempts without valid recording dates are excluded from comparisons." : ""}
      </Text>
      {improvements.map((item) => (
        <ProgressMetricCard key={item.label} {...item} />
      ))}

      <View style={styles.keepGoingCard}>
        <View style={styles.keepGoingHeader}>
          <Ionicons name="trophy" size={16} color="#FFFFFF" />
          <Text style={styles.keepGoingTitle}>Keep Going</Text>
        </View>
        <Text style={styles.keepGoingText}>
          {getProgressMessage(progress)}
        </Text>
      </View>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    title: {
      ...typography.heading,
      fontSize: 24,
    },
    subtitle: {
      ...typography.body,
      fontSize: 15,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    statsGrid: {
      gap: spacing.smd,
      marginBottom: spacing.lg,
    },
    statsRow: {
      flexDirection: "row",
      gap: spacing.smd,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.navy,
      marginBottom: spacing.md,
    },
    keepGoingCard: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
      shadowColor: "#101828",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
    },
    keepGoingHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    keepGoingTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#FFFFFF",
      marginLeft: spacing.xs,
    },
    keepGoingText: {
      fontSize: 13,
      color: "#FFFFFF",
      opacity: 0.9,
      marginTop: spacing.xs,
    },
    emptyContent: {
      flexGrow: 1,
    },
    loadingText: {
      ...typography.body,
      textAlign: "center",
      marginTop: spacing.md,
    },
    comparisonNote: {
      ...typography.body,
      fontSize: 13,
      marginBottom: spacing.md,
    },
    emptyBody: {
      flex: 1,
      justifyContent: "center",
    },
  });
}
