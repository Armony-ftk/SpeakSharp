import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, Redirect, router } from 'expo-router';
import AuthLayout from '../ui/AuthLayout';
import BrandTitle from '../ui/BrandTitle';
import AuthTextField from '../ui/AuthTextField';
import PrimaryButton from '../ui/PrimaryButton';
import OrDivider from '../ui/OrDivider';
import GoogleButton from '../ui/GoogleButton';
import SplashScreen from './SplashScreen';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState('form');
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => setPhase('done'), 1200);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleSignIn = () => {
    setPhase('loading');
  };

  if (phase === 'done') {
    return <Redirect href="/home?variant=mock" />;
  }

  if (phase === 'loading') {
    return <SplashScreen />;
  }

  return (
    <AuthLayout>
      <BrandTitle />
      <Text style={styles.subtitle}>Sign in to continue your practice.</Text>

      <AuthTextField
        label="Email Address"
        placeholder="you@example.com"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <AuthTextField
        label="Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Text
        style={styles.forgotLink}
        onPress={() => router.push('/forgot-password')}
      >
        Forgot Password?
      </Text>

      <PrimaryButton label="SIGN IN" onPress={handleSignIn} />

      <OrDivider label="Or continue with" />
      <GoogleButton onPress={() => {}} />

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Link href="/sign-up" style={styles.footerLink}>
          Sign Up
        </Link>
      </View>
    </AuthLayout>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    subtitle: {
      ...typography.body,
      lineHeight: 20,
      letterSpacing: 0.1,
      marginTop: spacing.xs,
      marginBottom: spacing.lg * 1.5,
    },
    forgotLink: {
      alignSelf: 'flex-end',
      color: colors.accent,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.1,
      paddingVertical: 4,
      marginTop: -spacing.xs,
      marginBottom: spacing.md,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.lg * 1.5,
    },
    footerText: {
      ...typography.body,
      fontSize: 14,
    },
    footerLink: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
  });
}