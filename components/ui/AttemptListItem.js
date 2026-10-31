import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function AttemptListItem({ number, title, timestamp, onPress, onDelete, deleting = false, disabled = false }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.openAttempt} onPress={onPress} activeOpacity={0.7} disabled={disabled || deleting}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>#{number}</Text>
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
      </TouchableOpacity>
      {onDelete ? <TouchableOpacity
        onPress={onDelete}
        disabled={disabled || deleting}
        accessibilityRole="button"
        accessibilityLabel={`Delete attempt ${number}`}
        accessibilityState={{ disabled: disabled || deleting, busy: deleting }}
        style={styles.deleteButton}
      >
        {deleting ? <ActivityIndicator size="small" color="#D92D20" />
          : <Ionicons name="trash-outline" size={20} color="#D92D20" />}
      </TouchableOpacity> : null}
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    openAttempt: { flex: 1, flexDirection: "row", alignItems: "center" },
    deleteButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.sm,
      marginBottom: spacing.sm,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.navySoft,
    },
    textWrap: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navy,
    },
    timestamp: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
}
