import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getStatusLabel(status) {
  if (status === "failed") {
    return "Failed";
  }
  if (status === "success") {
    return "Completed";
  }
  return "—";
}

export default function ActivityRow({ event }) {
  const { colors } = useAppTheme();
  const statusLabel = getStatusLabel(event.status);

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.navy }]}>
          {event.label || "—"}
        </Text>
        <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
          {formatTimestamp(event.occurredAt)}
        </Text>
      </View>
      <View
        style={[
          styles.status,
          {
            backgroundColor: colors.card,
            borderColor: event.status === "failed" ? "#D92D20" : colors.cardBorder,
          },
        ]}
        accessibilityLabel={`Activity status: ${statusLabel}`}
      >
        <Text
          style={[
            styles.statusLabel,
            { color: event.status === "failed" ? "#D92D20" : colors.navySoft },
          ]}
        >
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.smd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 12,
    flexShrink: 1,
  },
  status: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
});
