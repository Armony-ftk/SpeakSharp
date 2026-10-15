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
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity
      style={[
        styles.button,
        pill && styles.buttonPill,
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading || disabled}
    >
      {loading ? (
        <>
          <ActivityIndicator color="#FFFFFF" size="small" />
          {loadingLabel ? (
            <Text style={[styles.label, styles.loadingLabel]}>
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
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
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
