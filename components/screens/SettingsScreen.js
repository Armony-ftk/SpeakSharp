import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import SettingsRow from "../ui/SettingsRow";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { getAuthErrorMessage, logout } from "../../services/authService";

export default function SettingsScreen() {
  const { isDark, setIsDark, colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  // Notifications / Offline Mode are local UI state only — not yet wired to real behavior.
  const [notifications, setNotifications] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setSignOutError("");
    setIsSigningOut(true);

    try {
      await logout();
    } catch (error) {
      setSignOutError(getAuthErrorMessage(error));
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenContainer>
      <AppHeader />

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="person-outline"
          label="Edit Profile"
          onPress={() => router.push("/edit-profile")}
        />
        <SettingsRow
          icon="lock-closed-outline"
          label="Change Password"
          onPress={() => router.push("/change-password")}
        />
      </View>

      <Text style={styles.sectionTitle}>Preferences</Text>
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

      <Text style={styles.sectionTitle}>Practice</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="cloud-offline-outline"
          label="Offline Mode"
          subtitle="Save practice data locally"
          value={offlineMode}
          onValueChange={setOfflineMode}
        />
      </View>

      <Text style={styles.sectionTitle}>Support</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="help-circle-outline"
          label="Help Center"
          onPress={() => {}}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => {}}
        />
      </View>

      <TouchableOpacity
        style={[styles.signOutButton, isSigningOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        activeOpacity={0.8}
        disabled={isSigningOut}
      >
        <Ionicons name="log-out-outline" size={16} color="#D92D20" />
        <Text style={styles.signOutText}>
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </Text>
      </TouchableOpacity>
      {signOutError ? (
        <Text style={styles.signOutError}>{signOutError}</Text>
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.navy,
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    signOutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#D92D20",
      borderRadius: radius.sm,
      paddingVertical: spacing.smd,
    },
    signOutText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#D92D20",
      marginLeft: spacing.xs,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    signOutError: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      marginTop: spacing.sm,
    },
  });
}
