import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../ui/ScreenContainer';
import SettingsRow from '../ui/SettingsRow';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SettingsScreen() {
  const { isDark, setIsDark, colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  // Notifications / Offline Mode are local UI state only — not yet wired to real behavior.
  const [notifications, setNotifications] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SpeakSharp</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="person-outline"
          label="Edit Profile"
          onPress={() => router.push('/edit-profile')}
        />
        <SettingsRow
          icon="lock-closed-outline"
          label="Change Password"
          onPress={() => router.push('/change-password')}
        />
      </View>

      <Text style={styles.sectionLabel}>PREFERENCES</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="moon-outline"
          label="Dark Mode"
          value={isDark}
          onValueChange={setIsDark}
        />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          value={notifications}
          onValueChange={setNotifications}
        />
      </View>

      <Text style={styles.sectionLabel}>PRACTICE</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="cloud-offline-outline"
          label="Offline Mode"
          subtitle="Save practice data locally"
          value={offlineMode}
          onValueChange={setOfflineMode}
        />
      </View>

      <Text style={styles.sectionLabel}>SUPPORT</Text>
      <View style={styles.card}>
        <SettingsRow icon="help-circle-outline" label="Help Center" onPress={() => {}} />
        <SettingsRow icon="document-text-outline" label="Terms of Service" onPress={() => {}} />
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => router.replace('/sign-in')}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={16} color="#D92D20" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.heading,
    fontSize: 17,
  },
  headerSpacer: {
    width: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D92D20',
    borderRadius: radius.sm,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D92D20',
    marginLeft: spacing.xs,
  },
  });
}
