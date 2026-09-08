import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import FilterTabs from "../ui/FilterTabs";
import SessionCard from "../ui/SessionCard";
import EmptyState from "../ui/EmptyState";
import FloatingActionButton from "../ui/FloatingActionButton";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

const FILTERS = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

// Mock data standing in for a real sessions API.
const sessions = [
  {
    id: "1",
    title: "DSW Final Presentation",
    date: "20 September",
    attempts: 4,
    latestScore: 8.1,
    bestScore: 8.4,
    status: "active",
  },
  {
    id: "2",
    title: "Database Presentation",
    date: "25 September",
    attempts: 2,
    latestScore: 6.8,
    bestScore: null,
    status: "active",
  },
];

export default function SessionsScreen() {
  const [filter, setFilter] = useState("active");
  const filteredSessions = sessions.filter(
    (session) => session.status === filter,
  );
  const isEmpty = filteredSessions.length === 0;
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <ScreenContainer
      contentStyle={isEmpty ? styles.emptyContent : undefined}
      floatingAction={
        !isEmpty ? (
          <FloatingActionButton
            onPress={() => router.push("/create-session")}
          />
        ) : null
      }
    >
      <AppHeader />
      <Text style={styles.title}>My Practice Sessions</Text>
      <Text style={styles.subtitle}>
        Review your recent recordings and track improvements.
      </Text>

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />

      {isEmpty ? (
        <View style={styles.emptyBody}>
          <EmptyState
            icon="mic-outline"
            title="No practice sessions"
            description="Create a session for your upcoming presentation and start practising."
            actionLabel="+ CREATE SESSION"
            onAction={() => router.push("/create-session")}
          />
        </View>
      ) : (
        <>
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              title={session.title}
              date={session.date}
              attempts={session.attempts}
              latestScore={session.latestScore}
              bestScore={session.bestScore}
              onPress={() => router.push(`/session/${session.id}`)}
            />
          ))}

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Continue Practicing</Text>
          <View style={styles.practiceGrid}>
            {filteredSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.practiceCard}
                onPress={() => router.push(`/session/${session.id}/attempt`)}
                activeOpacity={0.8}
              >
                <Text style={styles.practiceTitle} numberOfLines={1}>
                  {session.title}
                </Text>
                <Text style={styles.practiceMeta}>
                  {session.attempts} attempts
                </Text>
                <View style={styles.practiceFooter}>
                  <Text style={styles.practiceScore}>
                    Latest:{" "}
                    <Text style={styles.practiceScoreValue}>
                      {session.latestScore != null
                        ? session.latestScore.toFixed(1)
                        : "--"}
                    </Text>
                    <Text style={styles.practiceScoreOutOf}> / 10</Text>
                  </Text>
                  <View style={styles.resumePill}>
                    <Text style={styles.resumeLabel}>Resume</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
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
    emptyContent: {
      flexGrow: 1,
    },
    emptyBody: {
      flex: 1,
      justifyContent: "center",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.navy,
      marginBottom: spacing.md,
    },
    practiceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.smd,
    },
    practiceCard: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    practiceTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.navy,
    },
    practiceMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    practiceFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.smd,
    },
    practiceScore: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    practiceScoreValue: {
      fontWeight: "700",
      color: colors.navy,
    },
    practiceScoreOutOf: {
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
