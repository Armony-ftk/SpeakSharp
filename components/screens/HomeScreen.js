import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ScreenContainer from '../ui/ScreenContainer';
import AppHeader from '../ui/AppHeader';
import LogoMark from '../ui/LogoMark';
import StatCard from '../ui/StatCard';
import SessionProgressCard from '../ui/SessionProgressCard';
import SessionListItem from '../ui/SessionListItem';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

// Mock data standing in for a real sessions API.
const overview = { sessions: 5, attempts: 21, average: 7.5 };
const mockSessions = [
  {
    id: '1',
    title: 'DSW Final Presentation',
    attempts: 4,
    latestScore: 8.1,
    status: 'ready',
    hasRecentFeedback: true,
  },
  {
    id: '2',
    title: 'Database Presentation',
    attempts: 2,
    latestScore: 6.8,
    status: 'ready',
    hasRecentFeedback: false,
  },
];
const emptySessions = [];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Decides which single CTA best moves the user forward, per the Next Best Action spec.
function getNextBestAction(sessionList) {
  if (sessionList.length === 0) {
    return { label: '+ Start New Practice', route: '/create-session' };
  }
  const noAttemptYet = sessionList.find((s) => s.attempts === 0);
  if (noAttemptYet) {
    return { label: 'Record First Attempt', route: `/session/${noAttemptYet.id}/attempt` };
  }
  const pendingAnalysis = sessionList.find((s) => s.status === 'processing');
  if (pendingAnalysis) {
    return { label: 'Continue Analysis', route: `/session/${pendingAnalysis.id}` };
  }
  const withFeedback = sessionList.find((s) => s.hasRecentFeedback);
  if (withFeedback) {
    return { label: 'Record Another Attempt', route: `/session/${withFeedback.id}/attempt` };
  }
  return { label: 'Continue Practicing', route: `/session/${sessionList[0].id}` };
}

export default function HomeScreen() {
  const { variant } = useLocalSearchParams();
  const sessions = variant === 'mock' ? mockSessions : emptySessions;
  const nextAction = getNextBestAction(sessions);
  const [primarySession, ...otherSessions] = sessions;
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  if (sessions.length === 0) {
    return (
      <ScreenContainer contentStyle={styles.emptyContent}>
        <AppHeader />
        <View style={styles.emptyBody}>
          <LogoMark size={140} />
          <Text style={styles.emptyTitle}>Ready to practise?</Text>
          <Text style={styles.emptyDescription}>
            Create your first Practice Session and record your first presentation.
          </Text>
        </View>
        <PrimaryButton label={nextAction.label} onPress={() => router.push(nextAction.route)} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader />
      <Text style={styles.greeting}>{getGreeting()} 👋</Text>
      <Text style={styles.subtitle}>Ready to improve your next presentation?</Text>

      <PrimaryButton label={nextAction.label} onPress={() => router.push(nextAction.route)} style={styles.cta} />

      <Text style={styles.sectionLabel}>OVERVIEW</Text>
      <View style={styles.statsRow}>
        <StatCard value={overview.sessions} label="Sessions" />
        <StatCard value={overview.attempts} label="Attempts" />
        <StatCard value={overview.average} label="Average" />
      </View>

      <Text style={styles.sectionLabel}>CONTINUE PRACTISING</Text>
      <SessionProgressCard
        title={primarySession.title}
        attempts={primarySession.attempts}
        latestScore={primarySession.latestScore}
        onPress={() => router.push(`/session/${primarySession.id}`)}
      />

      {otherSessions.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
          {otherSessions.map((session) => (
            <SessionListItem
              key={session.id}
              title={session.title}
              attempts={session.attempts}
              latestScore={session.latestScore}
              onPress={() => router.push(`/session/${session.id}`)}
            />
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  greeting: {
    ...typography.heading,
    fontSize: 22,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  cta: {
    marginBottom: spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.heading,
    fontSize: 20,
    marginTop: spacing.lg,
  },
  emptyDescription: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  });
}
