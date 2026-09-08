import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ConfirmDialog({
  visible,
  title,
  message,
  items,
  cancelLabel = "Cancel",
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}) {
  const { colors, typography, isDark } = useAppTheme();
  const styles = getStyles(colors, typography, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {items ? (
            <View style={styles.items}>
              {items.map((item) => (
                <View key={item} style={styles.itemRow}>
                  <Ionicons
                    name="ellipse"
                    size={5}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                destructive && styles.confirmButtonDestructive,
              ]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(colors, typography, isDark) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(16, 24, 40, 0.65)",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
    },
    card: {
      width: "100%",
      // Solid surface so underlying screen content can't bleed through.
      backgroundColor: isDark ? "#171C26" : "#FFFFFF",
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      padding: spacing.lg,
      shadowColor: "#101828",
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      elevation: 8,
    },
    title: {
      ...typography.heading,
      fontSize: 17,
    },
    message: {
      ...typography.body,
      marginTop: spacing.xs,
    },
    items: {
      marginTop: spacing.md,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    itemText: {
      fontSize: 13,
      color: colors.navySoft,
      marginLeft: spacing.xs,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    cancelButton: {
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
    },
    cancelText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    confirmButton: {
      backgroundColor: colors.accent,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
    },
    confirmButtonDestructive: {
      backgroundColor: "#D92D20",
    },
    confirmText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
}
