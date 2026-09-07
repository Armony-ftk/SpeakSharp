import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, Redirect } from 'expo-router';
import AuthLayout from '../ui/AuthLayout';
import BrandTitle from '../ui/BrandTitle';
import AuthTextField from '../ui/AuthTextField';
import PrimaryButton from '../ui/PrimaryButton';
import OrDivider from '../ui/OrDivider';
import GoogleButton from '../ui/GoogleButton';
import Checkbox from '../ui/Checkbox';
import SplashScreen from './SplashScreen';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState('form');
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => setPhase('done'), 1200);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleCreateAccount = () => {
    setPhase('loading');
  };

  if (phase === 'done') {
    return <Redirect href="/home?variant=new" />;
  }

  if (phase === 'loading') {
    return <SplashScreen />;
  }

  return (
    <AuthLayout>
      <BrandTitle />
      <Text style={styles.heading}>Create Account</Text>
      <Text style={styles.subtitle}>Start your journey to becoming a better speaker.</Text>

      <AuthTextField
        label="Full Name"
        placeholder="Aubrey Drake Graham"
        icon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
      />
      <AuthTextField
        label="Email Address"
        placeholder="drizzy@ovo.com"
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
        helperText="Must be at least 8 characters."
      />

      <Checkbox checked={agreed} onToggle={() => setAgreed((prev) => !prev)}>
        <Text style={styles.termsText}>
          I agree to the <Text style={styles.termsLink}>Terms & Conditions</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>
      </Checkbox>

      <PrimaryButton label="CREATE ACCOUNT →" onPress={handleCreateAccount} />

      <OrDivider />
      <GoogleButton label="Sign up with Google" onPress={() => {}} />

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/sign-in" style={styles.footerLink}>
          Sign In
        </Link>
      </View>
    </AuthLayout>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  heading: {
    ...typography.heading,
    marginTop: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  termsText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.accent,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    ...typography.body,
  },
  footerLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  });
}
