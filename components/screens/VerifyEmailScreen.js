import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useLocalSearchParams } from "expo-router";
import AuthLayout from "../ui/AuthLayout";
import BrandTitle from "../ui/BrandTitle";
import PrimaryButton from "../ui/PrimaryButton";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import {
  getAuthErrorMessage,
  logout,
  sendVerificationEmail,
} from "../../services/authService";

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams();
  const initialMessage = firstParam(params.message);
  const initialMessageType = firstParam(params.messageType);
  const [operation, setOperation] = useState(null);
  const [feedback, setFeedback] = useState(() =>
    initialMessage
      ? { type: initialMessageType === "error" ? "error" : "success", text: initialMessage }
      : null,
  );
  const { currentUser, refreshUser } = useAuth();
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    if (initialMessage) {
      setFeedback({
        type: initialMessageType === "error" ? "error" : "success",
        text: initialMessage,
      });
    }
  }, [initialMessage, initialMessageType]);

  const handleRefresh = async () => {
    if (operation) return;

    setFeedback(null);
    setOperation("refresh");

    try {
      const refreshedUser = await refreshUser();
      if (!refreshedUser.emailVerified) {
        setFeedback({
          type: "error",
          text: "Your email has not been verified yet. Please check your inbox and try again.",
        });
      }
    } catch (error) {
      setFeedback({ type: "error", text: getAuthErrorMessage(error) });
    } finally {
      setOperation(null);
    }
  };

  const handleResend = async () => {
    if (operation) return;

    setFeedback(null);
    setOperation("resend");

    try {
      await sendVerificationEmail(currentUser);
      setFeedback({
        type: "success",
        text: "A new verification email has been sent. Check your inbox.",
      });
    } catch (error) {
      setFeedback({ type: "error", text: getAuthErrorMessage(error) });
    } finally {
      setOperation(null);
    }
  };

  const handleLogout = async () => {
    if (operation) return;

    setFeedback(null);
    setOperation("logout");

    try {
      await logout();
    } catch (error) {
      setFeedback({ type: "error", text: getAuthErrorMessage(error) });
      setOperation(null);
    }
  };

  return (
    <AuthLayout>
      <BrandTitle />
      <Text style={styles.heading}>Verify Your Email</Text>
      <Text style={styles.subtitle}>
        We sent a verification link to{" "}
        <Text style={styles.email}>{currentUser?.email}</Text>. Check your inbox,
        open the link, then return here.
      </Text>

      {feedback ? (
        <Text
          style={
            feedback.type === "success"
              ? styles.successText
              : styles.errorText
          }
        >
          {feedback.text}
        </Text>
      ) : null}

      <PrimaryButton
        label="I'VE VERIFIED MY EMAIL"
        loadingLabel="CHECKING..."
        loading={operation === "refresh"}
        disabled={Boolean(operation) && operation !== "refresh"}
        onPress={handleRefresh}
      />
      <PrimaryButton
        label="RESEND VERIFICATION EMAIL"
        loadingLabel="SENDING..."
        loading={operation === "resend"}
        disabled={Boolean(operation) && operation !== "resend"}
        onPress={handleResend}
        style={styles.secondaryButton}
      />

      <TouchableOpacity
        onPress={handleLogout}
        disabled={Boolean(operation)}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutText}>
          {operation === "logout" ? "Signing out..." : "Sign out and return to login"}
        </Text>
      </TouchableOpacity>
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
      lineHeight: 20,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    email: {
      color: colors.textPrimary,
      fontWeight: "700",
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
    secondaryButton: {
      marginTop: spacing.md,
    },
    logoutButton: {
      alignItems: "center",
      paddingVertical: spacing.sm,
      marginTop: spacing.md,
    },
    logoutText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
  });
}
