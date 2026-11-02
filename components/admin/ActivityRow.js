import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getStatusLabel(status) {
  if (status === "failed") return "Failed";
  if (status === "success") return "Completed";
  return "—";
}

export default function ActivityRow({ event, userLabel, userLabelStyle }) {
  const { colors, isDark } = useAppTheme();
  const statusLabel = getStatusLabel(event.status);
  const isAdminEvent = event.type?.toLowerCase() === "admin";
  const isAdminAction = isAdminEvent &&
    (event.action === "suspend" || event.action === "reactivate");
  const displayLabel = isAdminAction
    ? event.action === "suspend" ? "Suspended a user" : "Reactivated a user"
    : isAdminEvent
      ? event.label || `${event.actorName || "Admin"} ${event.action || "performed an action on"} ${event.userName || "a user"}`
      : event.label || "—";
  const statusColor = event.status === "failed"
    ? isDark ? "#FDA29B" : "#B42318"
    : colors.textSecondary;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {userLabel != null ? (
        <Text style={[userLabelStyle, styles.userLabel, isAdminAction && { color: colors.accent }]}>
          {isAdminAction ? "Admin Action" : userLabel}
        </Text>
      ) : null}
      <Text style={[styles.label, { color: colors.navy }]}>{displayLabel}</Text>
      {isAdminEvent && event.action && !isAdminAction ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          Action: {event.action}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
          {formatTimestamp(event.occurredAt)}
        </Text>
        <View
          style={[styles.status, { borderColor: event.status === "failed" ? statusColor : colors.cardBorder }]}
          accessibilityLabel={`Activity status: ${statusLabel}`}
        >
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minWidth: 0,
    paddingVertical: spacing.smd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  userLabel: { flexShrink: 1 },
  label: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 18 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  timestamp: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  status: {
    maxWidth: "100%", borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  statusLabel: { fontSize: 11, fontWeight: "600" },
});
