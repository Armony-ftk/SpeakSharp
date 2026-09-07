import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import StatCard from "../ui/StatCard";
import ProgressMetricCard from "../ui/ProgressMetricCard";
import EmptyState from "../ui/EmptyState";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

// Mock data standing in for a real progress-summary API.
const hasAttempts = true;
const overview = { sessions: 5, attempts: 21, average: 7.5, best: 8.6 };
const improvements = [
  {
    label: "Average Rating",
    previousValue: "6.4",
    currentValue: "7.5",
    delta: "+1.1",
  },
  {
    label: "Filler Words",
    previousValue: "18",
    currentValue: "9",
    delta: "9 fewer",
  },
  {
    label: "Speaking Pace",
    previousValue: "132 WPM",
    currentValue: "121 WPM",
    delta: "11 WPM slower",
  },
];

export default function ProgressScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  if (!hasAttempts) {
    return (
      <ScreenContainer contentStyle={styles.emptyContent}>
        <AppHeader />
        <View style={styles.emptyBody}>
          <EmptyState
            icon="trending-up-outline"
            title="Your progress starts here"
            description="Complete your first practice attempt to start tracking your improvement."
            actionLabel="START PRACTISING"
            onAction={() => router.push("/create-session")}
          />
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
          <StatCard value={overview.average} label="Average" />
          <StatCard
            value={overview.best}
            label="Best"
            valueColor={colors.success}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Your Improvement</Text>
      {improvements.map((item) => (
        <ProgressMetricCard key={item.label} {...item} />
      ))}

      <View style={styles.keepGoingCard}>
        <View style={styles.keepGoingHeader}>
          <Ionicons name="trophy" size={16} color="#FFFFFF" />
          <Text style={styles.keepGoingTitle}>Keep Going</Text>
        </View>
        <Text style={styles.keepGoingText}>
          You're showing consistent improvement across your attempts.
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
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    statsGrid: {
      gap: spacing.sm + 4,
      marginBottom: spacing.lg,
    },
    statsRow: {
      flexDirection: "row",
      gap: spacing.sm + 4,
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
    emptyBody: {
      flex: 1,
      justifyContent: "center",
    },
  });
}
