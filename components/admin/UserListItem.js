import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import StatusBadge from "./StatusBadge";

function displayValue(value) {
  return value == null || value === "" ? "—" : String(value);
}

export default function UserListItem({ user, onPress }) {
  const { colors } = useAppTheme();
  const name = displayValue(user.fullName);
  const email = displayValue(user.email);
  const sessionCount = displayValue(user.totalSessions);
  const status =
    user.accountStatus === "active"
      ? "Active"
      : user.accountStatus === "suspended"
        ? "Suspended"
        : "—";

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${email}, ${status}, Sessions: ${sessionCount}`}
      accessibilityHint="Opens user details"
      accessibilityState={{ disabled: !user.userId }}
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!user.userId}
      activeOpacity={0.75}
    >
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.navy }]}>{name}</Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>
          {email}
        </Text>
        <View style={styles.meta}>
          <StatusBadge status={user.accountStatus} />
          <Text style={[styles.sessions, { color: colors.navySoft }]}>
            Sessions: {sessionCount}
          </Text>
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textSecondary}
        accessible={false}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  email: {
    fontSize: 14,
    flexShrink: 1,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sessions: {
    fontSize: 12,
    flexShrink: 1,
  },
});
