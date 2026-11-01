import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function FilterTabs({ options, value, onChange, admin = false }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={[styles.row, admin && styles.adminRow]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.tab, admin && styles.adminTab, active && styles.tabActive]}
            accessibilityRole={admin ? "tab" : undefined}
            accessibilityState={admin ? { selected: active } : undefined}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.label, admin && styles.adminLabel, active && styles.labelActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    adminRow: { flexWrap: "wrap", gap: spacing.xs, borderRadius: radius.md, marginBottom: spacing.md },
    adminTab: { flexBasis: 88, flexGrow: 1, minHeight: 44, paddingHorizontal: spacing.sm, justifyContent: "center", borderRadius: radius.sm },
    adminLabel: { textAlign: "center", flexShrink: 1 },
    row: {
      flexDirection: "row",
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      padding: 4,
      marginBottom: spacing.lg,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: radius.pill,
      alignItems: "center",
    },
    tabActive: {
      backgroundColor: colors.accent,
      shadowColor: "#101828",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navySoft,
    },
    labelActive: {
      color: "#FFFFFF",
    },
  });
}
