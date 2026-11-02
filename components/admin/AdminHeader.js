import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function AdminHeader({ title, subtitle, back = false, settings = true }) {
  const { colors, typography } = useAppTheme();

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        {back ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.iconButton}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/admin")}
          >
            <Ionicons name="arrow-back" size={22} color={colors.navy} />
          </TouchableOpacity>
        ) : null}
        <Text style={[typography.heading, styles.title]} accessibilityRole="header">
          {title}
        </Text>
        {settings ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            onPress={() => router.push("/admin/settings")}
            activeOpacity={0.75}
            style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 }]}
          >
            <Ionicons name="settings-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
      {subtitle ? <Text style={[typography.body, styles.subtitle]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, minWidth: 0, fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, lineHeight: 20 },
  iconButton: {
    width: 44, height: 44, flexShrink: 0, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
});
