import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ProgressMetricCard({
  label,
  previousLabel = "Previous",
  previousValue,
  currentLabel = "Current",
  currentValue,
  delta,
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {delta ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{delta}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.valuesRow}>
        <View style={styles.valueBlock}>
          <Text style={styles.valueCaption}>{previousLabel}</Text>
          <Text style={styles.previousValue}>{previousValue}</Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={16}
          color={colors.placeholder}
          style={styles.arrow}
        />
        <View style={styles.valueBlock}>
          <Text style={styles.valueCaption}>{currentLabel}</Text>
          <Text style={styles.currentValue}>{currentValue}</Text>
        </View>
      </View>
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
    label: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.navy,
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
    valuesRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    valueBlock: {
      flex: 1,
    },
    arrow: {
      marginHorizontal: spacing.sm,
    },
    valueCaption: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    previousValue: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    currentValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.navy,
    },
  });
}
