import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function StatCard({
  value,
  label,
  valueColor,
  subtitle,
  subtitleColor,
  admin = false,
}) {
  const { colors } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const styles = getStyles(colors);

  return (
    <View style={[styles.stat, admin && styles.adminCard]}>
      <Text style={[styles.label, admin && { alignSelf: "stretch", minHeight: 38 * fontScale, lineHeight: 19 }]}>{label}</Text>
      <Text
        style={[styles.value, admin && styles.adminValue, valueColor && { color: valueColor }]}
        numberOfLines={admin ? 1 : undefined}
        adjustsFontSizeToFit={admin}
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      {subtitle || admin ? (
        <Text
          style={[styles.subtitle, admin && styles.adminSubtitle, subtitleColor && { color: subtitleColor }]}
        >
          {subtitle || " "}
        </Text>
      ) : null}
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    adminCard: {
      minWidth: 0,
      minHeight: 152,
      alignItems: "flex-start",
      padding: spacing.md,
      shadowOpacity: 0.03,
      shadowRadius: 8,
      elevation: 1,
    },
    adminValue: {
      alignSelf: "stretch",
      fontSize: 30,
      fontVariant: ["tabular-nums"],
      marginTop: spacing.sm,
    },
    adminSubtitle: { fontSize: 12, marginTop: spacing.xs },
    stat: {
      flex: 1,
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    value: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.navy,
      marginTop: spacing.xs,
    },
    label: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    subtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
}
