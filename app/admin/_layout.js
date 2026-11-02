import { Redirect, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import PrimaryButton from "../../components/ui/PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { useAdminAccess } from "../../hooks/useAdminAccess";
import { ADMIN_DARK_MODE_KEY } from "../../constants/adminPreferences";

export default function AdminLayout() {
  const {
    currentUser,
    initializing,
    isEmailVerified,
    role,
    roleLoading,
  } = useAuth();

  const { status, retry } = useAdminAccess();
  const { colors, typography, isDark, setIsDark } = useAppTheme();
  const previousTheme = useRef(isDark);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    if (role !== "admin" || status !== "allowed") return;
    let current = true;
    AsyncStorage.getItem(ADMIN_DARK_MODE_KEY)
      .then((saved) => {
        if (current && (saved === "true" || saved === "false")) {
          setIsDark(saved === "true");
        }
      })
      // An unavailable local preference must not block the admin area.
      .catch(() => {})
      .finally(() => { if (current) setThemeReady(true); });
    return () => {
      current = false;
      // Keep the normal-user theme independent of the admin preference.
      setIsDark(previousTheme.current);
    };
  }, [role, status, setIsDark]);

  if (initializing || roleLoading || status === "checking") {
    return (
      <View style={[styles.message, { backgroundColor: colors.background }]}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          Checking access…
        </Text>
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/sign-in" />;
  }

  if (!isEmailVerified) {
    return <Redirect href="/verify-email" />;
  }

  if (status === "error") {
    return (
      <View style={[styles.message, { backgroundColor: colors.background }]}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          Couldn’t verify admin access.
        </Text>
        <PrimaryButton label="Retry" onPress={retry} />
      </View>
    );
  }

  // Fail closed: both checks must explicitly succeed.
  if (role !== "admin" || status !== "allowed") {
    return <Redirect href="/home" />;
  }

  if (!themeReady) {
    return (
      <View style={[styles.message, { backgroundColor: colors.background }]} accessibilityLabel="Loading preferences">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="users/[userId]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  message: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
