import { Redirect, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import PrimaryButton from "../../components/ui/PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { useAdminAccess } from "../../hooks/useAdminAccess";

export default function AdminLayout() {
  const {
    currentUser,
    initializing,
    isEmailVerified,
    role,
    roleLoading,
  } = useAuth();

  const { status, retry } = useAdminAccess();
  const { colors, typography } = useAppTheme();

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
