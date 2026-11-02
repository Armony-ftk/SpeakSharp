import { useEffect, useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { radius, spacing } from "../../constants/theme";

const TERMS = [
  ["1. About SpeakSharp", "SpeakSharp is an academic application designed to help users improve their public-speaking skills through practice recordings, speech analysis and AI-generated feedback."],
  ["2. Responsible Use", "Users must use SpeakSharp responsibly and avoid uploading unlawful, harmful or unauthorized content."],
  ["3. Recordings and Data", "SpeakSharp stores practice information and recordings using Firebase. Audio and transcripts may be processed by third-party speech recognition and AI services to generate feedback."],
  ["4. AI Feedback", "AI-generated evaluations are intended as learning guidance. Results may not always be completely accurate and should not be considered professional assessments."],
  ["5. Account Access", "Accounts may be suspended for misuse of the application."],
  ["6. Changes and Availability", "SpeakSharp is an academic project. Features and availability may change during development and testing."],
];

export default function SupportModal({ kind, onClose }) {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors, isDark);
  const [supportError, setSupportError] = useState("");
  useEffect(() => { setSupportError(""); }, [kind]);

  const openEmail = async () => {
    setSupportError("");
    try {
      await Linking.openURL("mailto:speaksharp13@gmail.com");
    } catch {
      setSupportError("Couldn’t open an email app. You can email speaksharp13@gmail.com directly.");
    }
  };

  return (
    <Modal visible={kind !== null} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.supportCard} accessibilityViewIsModal>
          <View style={styles.supportHeader}>
            <Text style={styles.supportTitle} accessibilityRole="header">
              {kind === "help" ? "Need Help?" : "SpeakSharp — Terms of Service"}
            </Text>
            <TouchableOpacity style={styles.closeIcon} accessibilityRole="button" accessibilityLabel="Close support" onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.navy} />
            </TouchableOpacity>
          </View>
          <ScrollView accessibilityLabel="Support content" style={styles.supportScroll} contentContainerStyle={styles.supportContent}>
            {kind === "help" ? (
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
              {kind === "help" ? "Contact us at:" : "For questions or assistance, contact"}
            </Text>
            <Text selectable accessibilityRole="link" style={styles.emailLink} onPress={openEmail}>speaksharp13@gmail.com</Text>
            {supportError ? <Text style={styles.error} accessibilityRole="alert">{supportError}</Text> : null}
          </ScrollView>
          <PrimaryButton admin label="Close" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function getStyles(colors, isDark) {
  const danger = isDark ? "#FDA29B" : "#B42318";
  return StyleSheet.create({
    sectionTitle: { color: colors.navy, fontSize: 16, fontWeight: "700", marginBottom: spacing.sm },
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
