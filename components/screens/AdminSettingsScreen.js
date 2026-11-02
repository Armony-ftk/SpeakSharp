import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AdminHeader from "../admin/AdminHeader";
import ScreenContainer from "../ui/ScreenContainer";
import SettingsRow from "../ui/SettingsRow";
import SupportModal from "../ui/SupportModal";
import { useAppTheme } from "../../constants/ThemeContext";
import { radius, spacing } from "../../constants/theme";
import { ADMIN_DARK_MODE_KEY, ADMIN_NOTIFICATIONS_KEY } from "../../constants/adminPreferences";
import { getAuthErrorMessage, logout } from "../../services/authService";

export default function AdminSettingsScreen() {
  const { isDark, setIsDark, colors } = useAppTheme();
  const styles = getStyles(colors, isDark);
  const [notifications, setNotifications] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [supportModal, setSupportModal] = useState(null);

  const openSupport = (kind) => {
    setSupportModal(kind);
  };

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(ADMIN_NOTIFICATIONS_KEY)
      .then((value) => { if (current) setNotifications(value === "true"); })
      .catch(() => { if (current) setPreferenceError("Couldn’t load saved preferences."); })
      .finally(() => { if (current) setPreferencesReady(true); });
    return () => { current = false; };
  }, []);

  const savePreference = async (key, value) => {
    if (!preferencesReady || savingPreference) return;
    setPreferenceError("");
    setSavingPreference(true);
    if (key === ADMIN_DARK_MODE_KEY) setIsDark(value);
    else setNotifications(value);
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch {
      setPreferenceError("Couldn’t save this preference. It applies for this session only.");
    } finally {
      setSavingPreference(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      router.replace("/sign-in");
    } catch (error) {
      setSignOutError(getAuthErrorMessage(error) || "Couldn’t sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <ScreenContainer admin bottomInset>
      <AdminHeader title="Settings" back settings={false} />
      <Text style={styles.sectionTitle} accessibilityRole="header">Preferences</Text>
      <View style={styles.card}>
        <SettingsRow admin
          icon="moon-outline" label="Dark Mode" value={isDark}
          onValueChange={(value) => savePreference(ADMIN_DARK_MODE_KEY, value)}
          disabled={!preferencesReady || savingPreference}
        />
        <SettingsRow admin
          icon="notifications-outline" label="Notifications"
          subtitle="Preference saved on this device. Notifications aren’t sent yet."
          value={notifications}
          onValueChange={(value) => savePreference(ADMIN_NOTIFICATIONS_KEY, value)}
          disabled={!preferencesReady || savingPreference}
        />
      </View>
      {preferenceError ? <Text style={styles.error} accessibilityRole="alert">{preferenceError}</Text> : null}

      <Text style={styles.sectionTitle} accessibilityRole="header">Support</Text>
      <View style={styles.card}>
        <SettingsRow admin icon="help-circle-outline" label="Help Center" onPress={() => openSupport("help")} />
        <SettingsRow admin icon="document-text-outline" label="Terms of Service" onPress={() => openSupport("terms")} />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">Account Action</Text>
      <TouchableOpacity
        accessibilityRole="button" accessibilityLabel="Sign Out"
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
        style={[styles.signOut, signingOut && styles.disabled]}
        onPress={handleSignOut} disabled={signingOut} activeOpacity={0.75}
      >
        {signingOut ? <ActivityIndicator color={styles.signOutText.color} /> :
          <Ionicons name="log-out-outline" size={20} color={styles.signOutText.color} />}
        <Text style={styles.signOutText}>{signingOut ? "Signing out…" : "Sign Out"}</Text>
      </TouchableOpacity>
      {signOutError ? <Text style={styles.error} accessibilityRole="alert">{signOutError}</Text> : null}

      <SupportModal kind={supportModal} onClose={() => setSupportModal(null)} />
    </ScreenContainer>
  );
}

function getStyles(colors, isDark) {
  const danger = isDark ? "#FDA29B" : "#B42318";
  return StyleSheet.create({
    sectionTitle: { color: colors.navy, fontSize: 16, fontWeight: "700", marginBottom: spacing.sm },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
    signOut: { minHeight: 48, padding: spacing.smd, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: danger, borderRadius: radius.md },
    signOutText: { color: danger, fontSize: 15, fontWeight: "700", flexShrink: 1, textAlign: "center" },
    disabled: { opacity: 0.6 },
    error: { color: danger, fontSize: 13, lineHeight: 19, marginVertical: spacing.sm },
  });
}
