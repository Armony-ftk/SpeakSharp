import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function FilterTabs({ options, value, onChange }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
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
