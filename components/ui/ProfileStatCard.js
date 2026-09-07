import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ProfileStatCard({ icon, badgeLabel, label, value }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={16} color={colors.navy} />
        </View>
        {badgeLabel ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginBottom: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: radius.pill,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
      backgroundColor: "rgba(18, 183, 106, 0.12)",
      borderRadius: radius.pill,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.success,
    },
    label: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    value: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.navy,
      marginTop: 2,
    },
  });
}
