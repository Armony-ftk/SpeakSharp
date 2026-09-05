import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import ScreenContainer from '../ui/ScreenContainer';
import AppHeader from '../ui/AppHeader';
import FilterTabs from '../ui/FilterTabs';
import SessionCard from '../ui/SessionCard';
import EmptyState from '../ui/EmptyState';
import FloatingActionButton from '../ui/FloatingActionButton';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

const FILTERS = [
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
];

// Mock data standing in for a real sessions API.
const sessions = [
  {
    id: '1',
    title: 'DSW Final Presentation',
    date: '20 September',
    attempts: 4,
    latestScore: 8.1,
    bestScore: 8.4,
    status: 'active',
  },
  {
    id: '2',
    title: 'Database Presentation',
    date: '25 September',
    attempts: 2,
    latestScore: 6.8,
    bestScore: null,
    status: 'active',
  },
];

export default function SessionsScreen() {
  const [filter, setFilter] = useState('active');
  const filteredSessions = sessions.filter((session) => session.status === filter);
  const isEmpty = filteredSessions.length === 0;
  const { typography } = useAppTheme();
  const styles = getStyles(typography);

  return (
    <ScreenContainer
      contentStyle={isEmpty ? styles.emptyContent : undefined}
      floatingAction={!isEmpty ? <FloatingActionButton onPress={() => router.push('/create-session')} /> : null}
    >
      <AppHeader />
      <Text style={styles.title}>My Practice Sessions</Text>
      <Text style={styles.subtitle}>Review your recent recordings and track improvements.</Text>

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />

      {isEmpty ? (
        <View style={styles.emptyBody}>
          <EmptyState
            icon="mic-outline"
            title="No practice sessions"
            description="Create a session for your upcoming presentation and start practising."
            actionLabel="+ CREATE SESSION"
            onAction={() => router.push('/create-session')}
          />
        </View>
      ) : (
        filteredSessions.map((session) => (
          <SessionCard
            key={session.id}
            title={session.title}
            date={session.date}
            attempts={session.attempts}
            latestScore={session.latestScore}
            bestScore={session.bestScore}
            onPress={() => router.push(`/session/${session.id}`)}
          />
        ))
      )}
    </ScreenContainer>
  );
}

function getStyles(typography) {
  return StyleSheet.create({
  title: {
    ...typography.heading,
    fontSize: 20,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  emptyBody: {
    flex: 1,
    justifyContent: 'center',
  },
  });
}
