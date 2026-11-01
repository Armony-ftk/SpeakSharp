import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AdminHeader from "../admin/AdminHeader";
import ScreenContainer from "../ui/ScreenContainer";
import SettingsRow from "../ui/SettingsRow";
import PrimaryButton from "../ui/PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { radius, spacing } from "../../constants/theme";
import { ADMIN_DARK_MODE_KEY, ADMIN_NOTIFICATIONS_KEY } from "../../constants/adminPreferences";
import { getAuthErrorMessage, logout } from "../../services/authService";

const TERMS = [
  ["1. About SpeakSharp", "SpeakSharp is an academic application designed to help users improve their public-speaking skills through practice recordings, speech analysis and AI-generated feedback."],
  ["2. Responsible Use", "Users must use SpeakSharp responsibly and avoid uploading unlawful, harmful or unauthorized content."],
  ["3. Recordings and Data", "SpeakSharp stores practice information and recordings using Firebase. Audio and transcripts may be processed by third-party speech recognition and AI services to generate feedback."],
  ["4. AI Feedback", "AI-generated evaluations are intended as learning guidance. Results may not always be completely accurate and should not be considered professional assessments."],
  ["5. Account Access", "Accounts may be suspended for misuse of the application."],
  ["6. Changes and Availability", "SpeakSharp is an academic project. Features and availability may change during development and testing."],
];

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
  const [supportError, setSupportError] = useState("");

  const openSupport = (kind) => {
    setSupportError("");
    setSupportModal(kind);
  };

  const openEmail = async () => {
    setSupportError("");
    try {
      await Linking.openURL("mailto:speaksharp13@gmail.com");
    } catch {
      setSupportError("Couldn’t open an email app. You can email speaksharp13@gmail.com directly.");
    }
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

      <Modal visible={supportModal !== null} transparent animationType="fade" onRequestClose={() => setSupportModal(null)}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.supportCard} accessibilityViewIsModal>
            <View style={styles.supportHeader}>
              <Text style={styles.supportTitle} accessibilityRole="header">
                {supportModal === "help" ? "Need Help?" : "SpeakSharp — Terms of Service"}
              </Text>
              <TouchableOpacity style={styles.closeIcon} accessibilityRole="button" accessibilityLabel="Close support" onPress={() => setSupportModal(null)}>
                <Ionicons name="close" size={22} color={colors.navy} />
              </TouchableOpacity>
            </View>
            <ScrollView accessibilityLabel="Support content" style={styles.supportScroll} contentContainerStyle={styles.supportContent}>
              {supportModal === "help" ? (
                <Text style={styles.supportBody}>
                  Have a question, experiencing an issue, or need assistance with SpeakSharp? We're here to help!
                </Text>
              ) : (
                <>
                  <Text style={styles.supportBody}>Last updated: 1 November 2026</Text>
                  {TERMS.map(([title, body]) => (
                    <View key={title} style={styles.term}>
                      <Text style={styles.sectionTitle}>{title}</Text>
                      <Text style={styles.supportBody}>{body}</Text>
                    </View>
                  ))}
                  <Text style={styles.sectionTitle}>7. Contact</Text>
                </>
              )}
              <Text style={styles.supportBody}>
                {supportModal === "help" ? "Contact us at:" : "For questions or assistance, contact"}
              </Text>
              <Text selectable accessibilityRole="link" style={styles.emailLink} onPress={openEmail}>speaksharp13@gmail.com</Text>
              {supportError ? <Text style={styles.error} accessibilityRole="alert">{supportError}</Text> : null}
            </ScrollView>
            <PrimaryButton admin label="Close" onPress={() => setSupportModal(null)} />
          </View>
        </SafeAreaView>
      </Modal>
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
    overlay: { flex: 1, backgroundColor: "rgba(16,24,40,0.65)", alignItems: "center", justifyContent: "center", padding: spacing.md },
    supportCard: { width: "100%", maxWidth: 520, maxHeight: "90%", padding: spacing.md, borderRadius: radius.lg, backgroundColor: isDark ? "#171C26" : "#FFFFFF", borderWidth: 1, borderColor: colors.cardBorder },
    supportHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
    supportTitle: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: "700", color: colors.navy },
    closeIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    supportScroll: { flexGrow: 0, flexShrink: 1 },
    supportContent: { gap: spacing.sm, paddingBottom: spacing.sm },
    supportBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    term: { marginTop: spacing.sm },
    emailLink: { color: colors.accent, fontSize: 14, lineHeight: 21, textDecorationLine: "underline", paddingVertical: spacing.smd },
  });
}
