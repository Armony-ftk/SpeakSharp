import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AuthLayout from '../ui/AuthLayout';
import BrandTitle from '../ui/BrandTitle';
import AuthTextField from '../ui/AuthTextField';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSendResetLink = () => {
    // TODO: wire up password reset request
  };

  return (
    <AuthLayout>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <BrandTitle style={styles.headerTitle} />
      </View>

      <Text style={styles.heading}>Forgot Password?</Text>
      <Text style={styles.subtitle}>
        Enter your email address and we'll send you instructions to reset your password.
      </Text>

      <AuthTextField
        label="Email Address"
        placeholder="you@example.com"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />

      <PrimaryButton label="SEND RESET LINK" onPress={handleSendResetLink} />

      <Link href="/sign-in" style={styles.footerLink}>
        Return to log in
      </Link>
    </AuthLayout>
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
    marginLeft: spacing.sm,
  },
  heading: {
    ...typography.heading,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  footerLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  });
}
