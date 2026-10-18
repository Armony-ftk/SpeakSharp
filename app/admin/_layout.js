import { Redirect, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import PrimaryButton from "../../components/ui/PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { useAdminAccess } from "../../hooks/useAdminAccess";

export default function AdminLayout() {
  const { currentUser, initializing, isEmailVerified } = useAuth();
  const { status, retry } = useAdminAccess();
  const { colors, typography } = useAppTheme();
  // DEV-ONLY: remove before handoff
  const devAdminBypass = __DEV__ && status === "allowed";

  if (initializing || status === "checking") {
    return (
      <View style={[styles.message, { backgroundColor: colors.background }]}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          Checking access…
        </Text>
      </View>
    );
  }

  if (!devAdminBypass && !currentUser) {
    return <Redirect href="/sign-in" />;
  }

  if (!devAdminBypass && !isEmailVerified) {
    return <Redirect href="/verify-email" />;
  }

  if (status === "denied") {
    return <Redirect href="/home" />;
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="users/[userId]" />
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
