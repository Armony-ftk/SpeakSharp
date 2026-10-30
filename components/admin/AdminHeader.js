import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  getAuthErrorMessage,
  logout,
} from "../../services/authService";

export default function AdminHeader({ title, subtitle }) {
  const { colors, typography } = useAppTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setError("");

    try {
      // Reuses the existing sign-out flow (same call as SettingsScreen).
      await logout();
      router.replace("/sign-in");
    } catch (signOutError) {
      setError(
        getAuthErrorMessage(signOutError) ||
          "Couldn’t sign out. Please try again.",
      );
      setSigningOut(false);
    }
  };

  const handleSettings = () => {
    if (signingOut) {
      return;
    }

    router.push("/settings");
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text
            style={[typography.heading, styles.title]}
            accessibilityRole="header"
          >
            {title}
          </Text>

          <View
            style={[
              styles.adminLabel,
              {
                borderColor: colors.cardBorder,
                backgroundColor: colors.card,
              },
            ]}
            accessibilityLabel="Admin area"
          >
            <Text style={[styles.adminLabelText, { color: colors.navySoft }]}>
              Admin
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            accessibilityState={{ disabled: signingOut }}
            onPress={handleSettings}
            disabled={signingOut}
            activeOpacity={0.75}
            style={[
              styles.actionButton,
              signingOut && styles.actionButtonDisabled,
            ]}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={colors.accent}
              accessible={false}
            />
            <Text style={[styles.actionLabel, { color: colors.accent }]}>
              Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Log out"
            accessibilityState={{
              disabled: signingOut,
              busy: signingOut,
            }}
            onPress={handleLogout}
            disabled={signingOut}
            activeOpacity={0.75}
            style={[
              styles.actionButton,
              signingOut && styles.actionButtonDisabled,
            ]}
          >
            <Ionicons
              name="log-out-outline"
              size={18}
              color={colors.accent}
              accessible={false}
            />
            <Text style={[styles.actionLabel, { color: colors.accent }]}>
              {signingOut ? "Signing out…" : "Log out"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {subtitle ? (
        <Text style={[typography.body, styles.subtitle]}>{subtitle}</Text>
      ) : null}

      {error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
  },
  adminLabel: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  adminLabelText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  subtitle: {
    flexShrink: 1,
  },
  error: {
    color: "#D92D20",
    fontSize: 13,
  },
});
