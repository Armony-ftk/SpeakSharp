import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import LogoMark from "../ui/LogoMark";
import PrimaryButton from "../ui/PrimaryButton";
import { getProfile } from "../../constants/mockProfile";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

// Mock data standing in for a real sessions API.
const overview = { sessions: 5, attempts: 21, average: 7.5 };
const mockSessions = [
  {
    id: "1",
    title: "DSW Final Presentation",
    attempts: 4,
    latestScore: 8.1,
    status: "ready",
    hasRecentFeedback: true,
  },
  {
    id: "2",
    title: "Database Presentation",
    attempts: 2,
    latestScore: 6.8,
    status: "ready",
    hasRecentFeedback: false,
  },
];
const emptySessions = [];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 14) return "Good day";
  if (hour >= 14 && hour < 18) return "Good afternoon";
  return "Good evening";
}

// Decides which single CTA best moves the user forward, per the Next Best Action spec.
function getNextBestAction(sessionList) {
  if (sessionList.length === 0) {
    return { label: "+ Start New Practice", route: "/create-session" };
  }
  const noAttemptYet = sessionList.find((s) => s.attempts === 0);
  if (noAttemptYet) {
    return {
      label: "Record First Attempt",
      route: `/session/${noAttemptYet.id}/attempt`,
    };
  }
  const pendingAnalysis = sessionList.find((s) => s.status === "processing");
  if (pendingAnalysis) {
    return {
      label: "Continue Analysis",
      route: `/session/${pendingAnalysis.id}`,
    };
  }
  const withFeedback = sessionList.find((s) => s.hasRecentFeedback);
  if (withFeedback) {
    return {
      label: "Record Another Attempt",
      route: `/session/${withFeedback.id}/attempt`,
    };
  }
  return {
    label: "Continue Practicing",
    route: `/session/${sessionList[0].id}`,
  };
}

export default function HomeScreen() {
  const { variant } = useLocalSearchParams();
  const sessions = variant === "mock" ? mockSessions : emptySessions;
  const nextAction = getNextBestAction(sessions);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const [profile, setProfile] = useState(() => getProfile());

  // Refresh from the mock store whenever this screen regains focus (e.g. after editing).
  useFocusEffect(
    useCallback(() => {
      setProfile({ ...getProfile() });
    }, []),
  );

  const firstName = profile.name.trim().split(" ")[0];

  if (sessions.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.emptyContent}>
        <AppHeader />
        <View style={styles.emptyBody}>
          <LogoMark size={140} />
          <Text style={styles.emptyTitle}>Ready to practise?</Text>
          <Text style={styles.emptyDescription}>
            Create your first Practice Session and record your first
            presentation.
          </Text>
        </View>
        <PrimaryButton
          label={nextAction.label}
          onPress={() => router.push(nextAction.route)}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="mic" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.brandName}>SpeakSharp</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newPill}
            onPress={() => router.push("/create-session")}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={colors.textPrimary} />
            <Text style={styles.newPillLabel}>New Presentation</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.greeting}>
        {getGreeting()}, {firstName}
      </Text>
      <Text style={styles.subtitle}>
        Ready to improve your next presentation?
      </Text>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push(nextAction.route)}
        activeOpacity={0.85}
      >
        <View style={styles.ctaIcon}>
          <Ionicons name="mic" size={16} color="#FFFFFF" />
        </View>
        <Text style={styles.ctaLabel}>{nextAction.label}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Your Progress</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sessions</Text>
          <Text style={styles.statValue}>{overview.sessions}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Attempts</Text>
          <Text style={styles.statValue}>{overview.attempts}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Avg Score</Text>
          <Text style={styles.statValue}>{overview.average}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Continue Practicing</Text>
      <View style={styles.sessionsGrid}>
        {sessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={styles.sessionCard}
            onPress={() => router.push(`/session/${session.id}`)}
            activeOpacity={0.8}
          >
            <Text style={styles.sessionTitle} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.sessionMeta}>{session.attempts} attempts</Text>
            <View style={styles.sessionFooter}>
              <Text style={styles.sessionScore}>
                Latest:{" "}
                <Text style={styles.sessionScoreValue}>
                  {session.latestScore.toFixed(1)}
                </Text>
                <Text style={styles.sessionScoreOutOf}> / 10</Text>
              </Text>
              <View style={styles.resumePill}>
                <Text style={styles.resumeLabel}>Resume</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  const cardShadow = {
    shadowColor: "#101828",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  };

  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.lg,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    logoBadge: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    brandName: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.navy,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    newPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingVertical: 7,
      paddingHorizontal: spacing.smd,
      ...cardShadow,
    },
    newPillLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    greeting: {
      ...typography.heading,
      fontSize: 24,
    },
    subtitle: {
      ...typography.body,
      fontSize: 15,
      marginTop: spacing.xs,
    },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
      ...cardShadow,
    },
    ctaIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: "#E5484D",
      alignItems: "center",
      justifyContent: "center",
    },
    ctaLabel: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.navy,
    },
    emptyContent: {
      flexGrow: 1,
    },
    emptyBody: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      ...typography.heading,
      fontSize: 20,
      marginTop: spacing.lg,
      textAlign: "center",
    },
    emptyDescription: {
      ...typography.body,
      textAlign: "center",
      marginTop: spacing.xs,
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.navy,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    statsRow: {
      flexDirection: "row",
      gap: spacing.smd,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      ...cardShadow,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.navy,
      marginTop: spacing.xs,
    },
    sessionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.smd,
    },
    sessionCard: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      ...cardShadow,
    },
    sessionTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.navy,
    },
    sessionMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    sessionFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.smd,
    },
    sessionScore: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    sessionScoreValue: {
      fontWeight: "700",
      color: colors.navy,
    },
    sessionScoreOutOf: {
      color: colors.placeholder,
    },
    resumePill: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingVertical: 5,
      paddingHorizontal: spacing.smd,
    },
    resumeLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.navy,
    },
  });
}
