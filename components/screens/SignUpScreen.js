import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import AuthLayout from "../ui/AuthLayout";
import BrandTitle from "../ui/BrandTitle";
import AuthTextField from "../ui/AuthTextField";
import PrimaryButton from "../ui/PrimaryButton";
import OrDivider from "../ui/OrDivider";
import GoogleButton from "../ui/GoogleButton";
import Checkbox from "../ui/Checkbox";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  getAuthErrorMessage,
  registerWithEmail,
  sendVerificationEmail,
} from "../../services/authService";
import { createUserProfile } from "../../services/profileService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleCreateAccount = async () => {
    if (loading) return;

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim();

    if (!normalizedName || !normalizedEmail || !password || !confirmPassword) {
      setErrorMessage("Complete all required fields.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!agreed) {
      setErrorMessage("Accept the Terms & Conditions and Privacy Policy.");
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      const credential = await registerWithEmail(normalizedEmail, password);
      const verificationMessages = [];

      try {
        await createUserProfile(credential.user.uid, {
          fullName: normalizedName,
          email: normalizedEmail,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn("Could not create the Firestore user profile", error);
        }
        verificationMessages.push(
          "Your account was created, but your profile could not be saved. Check your connection and contact support if the problem continues.",
        );
      }

      try {
        await sendVerificationEmail(credential.user);
      } catch (error) {
        verificationMessages.push(getAuthErrorMessage(error));
      }

      router.replace({
        pathname: "/verify-email",
        params: verificationMessages.length
          ? { message: verificationMessages.join(" "), messageType: "error" }
          : {},
      });
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <BrandTitle />
      <Text style={styles.heading}>Create Account</Text>
      <Text style={styles.subtitle}>
        Start your journey to becoming a better speaker.
      </Text>

      <AuthTextField
        label="Full Name"
        placeholder="Aubrey Drake Graham"
        icon="person-outline"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        editable={!loading}
      />
      <AuthTextField
        label="Email Address"
        placeholder="drizzy@ovo.com"
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
        helperText="Must be at least 8 characters."
        editable={!loading}
      />
      <AuthTextField
        label="Confirm Password"
        placeholder="••••••••"
        icon="lock-closed-outline"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!loading}
      />

      <Checkbox checked={agreed} onToggle={() => setAgreed((prev) => !prev)}>
        <Text style={styles.termsText}>
          I agree to the{" "}
          <Text style={styles.termsLink}>Terms & Conditions</Text> and{" "}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>
      </Checkbox>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <PrimaryButton
        label="CREATE ACCOUNT →"
        loadingLabel="CREATING ACCOUNT..."
        loading={loading}
        onPress={handleCreateAccount}
      />

      <OrDivider />
      <GoogleButton label="Sign up with Google" onPress={() => {}} disabled />

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
      fontWeight: "600",
    },
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: spacing.lg,
    },
    footerText: {
      ...typography.body,
    },
    footerLink: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "700",
    },
  });
}
