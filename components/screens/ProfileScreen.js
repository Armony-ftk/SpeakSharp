import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../ui/ScreenContainer';
import AppHeader from '../ui/AppHeader';
import ProfileStatCard from '../ui/ProfileStatCard';
import ProgressBar from '../ui/ProgressBar';
import { getProfile, getInitials } from '../../constants/mockProfile';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

const stats = {
  totalSessions: 5,
  averageScore: 7.5,
};
const goal = {
  title: 'Improve Conclusion Score',
  target: 'Target: 8.0 by next month',
  progress: 0.7,
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState(() => getProfile());
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  // Refresh from the mock store whenever this screen regains focus (e.g. after editing).
  useFocusEffect(
    useCallback(() => {
      setProfile({ ...getProfile() });
    }, [])
  );

  return (
    <ScreenContainer>
      <AppHeader rightIcon="settings-outline" onRightPress={() => router.push('/settings')} />

      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.memberSince}>Member since {profile.memberSince}</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil-outline" size={14} color={colors.navy} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your Stats</Text>
      <ProfileStatCard
        icon="mic-outline"
        badgeLabel="Active"
        label="Total Sessions"
        value={stats.totalSessions}
      />
      <ProfileStatCard
        icon="star-outline"
        badgeLabel="+0.5"
        label="Average Score"
        value={stats.averageScore}
      />

      <Text style={styles.sectionTitle}>Current Goal</Text>
      <View style={styles.goalCard}>
        <View style={styles.goalHeaderRow}>
          <View style={styles.goalIconWrap}>
            <Ionicons name="flag-outline" size={16} color={colors.accent} />
          </View>
          <View style={styles.goalTextWrap}>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <Text style={styles.goalTarget}>{goal.target}</Text>
          </View>
        </View>
        <View style={styles.goalProgressRow}>
          <Text style={styles.goalProgressLabel}>Progress</Text>
          <Text style={styles.goalProgressValue}>{Math.round(goal.progress * 100)}%</Text>
        </View>
        <ProgressBar progress={goal.progress} />
      </View>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: '#101828',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    ...typography.heading,
    fontSize: 20,
  },
  memberSince: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
    marginLeft: spacing.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  goalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  goalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  goalTextWrap: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  goalTarget: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  goalProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  goalProgressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  goalProgressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  });
}
