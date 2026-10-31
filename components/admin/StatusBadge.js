import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function StatusBadge({ status }) {
  const { colors } = useAppTheme();
  const normalizedStatus = status?.toLowerCase();
  const label =
    normalizedStatus === "active"
      ? "Active"
      : normalizedStatus === "suspended"
        ? "Suspended"
        : "—";
  const isSuspended = normalizedStatus === "suspended";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.card,
          borderColor: isSuspended ? "#D92D20" : colors.cardBorder,
        },
      ]}
      accessibilityLabel={`Account status: ${label}`}
    >
      <Text
        style={[
          styles.label,
          { color: isSuspended ? "#D92D20" : colors.navySoft },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});
