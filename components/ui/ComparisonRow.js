import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ComparisonRow({
  label,
  meta,
  beforeLabel,
  afterLabel,
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.row}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{beforeLabel}</Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={14}
          color={colors.placeholder}
          style={styles.arrow}
        />
        <View style={[styles.pill, styles.pillActive]}>
          <Text style={[styles.pillText, styles.pillTextActive]}>
            {afterLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    row: {
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.navySoft,
    },
    meta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    pillRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    arrow: {
      marginHorizontal: spacing.xs,
    },
    pill: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
    },
    pillActive: {
      backgroundColor: colors.accent,
    },
    pillText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    pillTextActive: {
      color: "#FFFFFF",
    },
  });
}
