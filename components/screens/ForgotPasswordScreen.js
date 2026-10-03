import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AuthLayout from "../ui/AuthLayout";
import BrandTitle from "../ui/BrandTitle";
import AuthTextField from "../ui/AuthTextField";
import PrimaryButton from "../ui/PrimaryButton";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  getAuthErrorMessage,
  sendPasswordReset,
} from "../../services/authService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSendResetLink = async () => {
    if (loading) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMessage("Enter your email address.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await sendPasswordReset(normalizedEmail);
      setSuccessMessage(
        "Password reset instructions have been sent. Check your inbox.",
      );
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
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
        Enter your email address and we'll send you instructions to reset your
        password.
      </Text>

      <AuthTextField
        label="Email Address"
        placeholder="you@example.com"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
      />

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
      {successMessage ? (
        <Text style={styles.successText}>{successMessage}</Text>
      ) : null}

      <PrimaryButton
        label="SEND RESET LINK"
        loadingLabel="SENDING..."
        loading={loading}
        onPress={handleSendResetLink}
      />

      <Link href="/sign-in" style={styles.footerLink}>
        Return to log in
      </Link>
    </AuthLayout>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
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
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    successText: {
      color: colors.success,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    footerLink: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
      marginTop: spacing.lg,
    },
  });
}
