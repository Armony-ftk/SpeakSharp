import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../ui/ScreenContainer';
import AuthTextField from '../ui/AuthTextField';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSave = () => {
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setError('');
    setSuccess(true);
    setTimeout(() => router.back(), 900);
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
      </View>

      <AuthTextField
        label="Current Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <AuthTextField
        label="New Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        helperText="Must be at least 8 characters."
      />
      <AuthTextField
        label="Confirm New Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Password updated.</Text> : null}

      <PrimaryButton label="SAVE PASSWORD" onPress={handleSave} />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.heading,
    fontSize: 18,
    marginLeft: spacing.sm,
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D92D20',
    marginBottom: spacing.sm,
  },
  success: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    marginBottom: spacing.sm,
  },
  });
}
