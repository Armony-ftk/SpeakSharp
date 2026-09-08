import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function StatCard({
  value,
  label,
  valueColor,
  subtitle,
  subtitleColor,
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor && { color: valueColor }]}>
        {value}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitle, subtitleColor && { color: subtitleColor }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
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
