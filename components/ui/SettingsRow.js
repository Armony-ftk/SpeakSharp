import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  value,
  onValueChange,
  admin = false,
  disabled = false,
}) {
  const isSwitch = typeof value === "boolean";
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  const content = (
    <View style={[styles.row, admin && styles.adminRow]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={16} color={colors.navySoft} />
      </View>
      <View style={[styles.textWrap, admin && styles.adminTextWrap]}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={[styles.subtitle, admin && styles.adminSubtitle]}>{subtitle}</Text> : null}
      </View>
      {isSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={admin ? label : undefined}
          accessibilityHint={admin ? subtitle : undefined}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      ) : (
        disabled ? null : <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
      )}
    </View>
  );

  if (isSwitch) {
    return content;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      accessibilityRole={admin ? "button" : undefined}
      accessibilityLabel={admin ? label : undefined}
      accessibilityHint={admin ? subtitle : undefined}
      accessibilityState={admin ? { disabled } : undefined}
    >
      {content}
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    adminRow: { minHeight: 64, paddingVertical: spacing.smd },
    adminTextWrap: { minWidth: 0, paddingRight: spacing.sm },
    adminSubtitle: { fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm,
    },
    textWrap: {
      flex: 1,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navy,
    },
    subtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
}
