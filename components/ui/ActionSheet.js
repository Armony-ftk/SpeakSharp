import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ActionSheet({ visible, onClose, title, actions }) {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                action.onPress();
              }}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={action.destructive ? "#D92D20" : colors.navy}
              />
              <Text
                style={[
                  styles.label,
                  action.destructive && styles.labelDestructive,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(16, 24, 40, 0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    title: {
      ...typography.heading,
      fontSize: 17,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.navy,
      marginLeft: spacing.sm,
    },
    labelDestructive: {
      color: "#D92D20",
    },
  });
}
