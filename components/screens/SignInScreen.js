import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import AuthLayout from "../ui/AuthLayout";
import BrandTitle from "../ui/BrandTitle";
import AuthTextField from "../ui/AuthTextField";
import PrimaryButton from "../ui/PrimaryButton";
import OrDivider from "../ui/OrDivider";
import GoogleButton from "../ui/GoogleButton";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  getAuthErrorMessage,
  loginWithEmail,
} from "../../services/authService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSignIn = async () => {
    if (loading) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setErrorMessage("Enter your email address and password.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      await loginWithEmail(normalizedEmail, password);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setLoading(false);
    }
  };

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
        editable={!loading}
      />
      <AuthTextField
        label="Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <Text
        style={styles.forgotLink}
        onPress={() => router.push("/forgot-password")}
      >
        Forgot Password?
      </Text>

      <PrimaryButton
        label="SIGN IN"
        loadingLabel="SIGNING IN..."
        loading={loading}
        onPress={handleSignIn}
      />

      <OrDivider label="Or continue with" />
      <GoogleButton onPress={() => {}} disabled />

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
      marginBottom: spacing.lg,
    },
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      marginTop: -spacing.xs,
      marginBottom: spacing.sm,
    },
    forgotLink: {
      alignSelf: "flex-end",
      color: colors.accent,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.1,
      paddingVertical: 4,
      marginTop: -spacing.xs,
      marginBottom: spacing.md,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.lg,
    },
    footerText: {
      ...typography.body,
      fontSize: 14,
    },
    footerLink: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 0.1,
    },
  });
}
