import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function PrimaryButton({
  label,
  onPress,
  loading,
  loadingLabel,
  disabled,
  style,
  icon,
  pill,
  admin = false,
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity
      style={[
        styles.button,
        admin && styles.adminButton,
        pill && styles.buttonPill,
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading || disabled}
      accessibilityRole={admin ? "button" : undefined}
      accessibilityState={admin ? { disabled: Boolean(loading || disabled), busy: Boolean(loading) } : undefined}
    >
      {loading ? (
        <>
          <ActivityIndicator color="#FFFFFF" size="small" />
          {loadingLabel ? (
            <Text style={[styles.label, styles.loadingLabel, admin && styles.adminLabel]}>
              {loadingLabel}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={16}
              color="#FFFFFF"
              style={styles.icon}
            />
          ) : null}
          <Text style={[styles.label, admin && styles.adminLabel]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    adminButton: { minHeight: 48, paddingHorizontal: spacing.md, shadowOpacity: 0, elevation: 0 },
    adminLabel: { flexShrink: 1, textAlign: "center", letterSpacing: 0 },
    button: {
      flexDirection: "row",
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.sm,
      shadowColor: "#101828",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
      marginBottom: spacing.sm,
    },
    buttonPill: {
      borderRadius: radius.pill,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    icon: {
      marginRight: spacing.sm,
    },
    label: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 0.6,
    },
    loadingLabel: {
      marginLeft: spacing.sm,
    },
  });
}
