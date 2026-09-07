import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function SessionCard({
  title,
  date,
  attempts,
  latestScore,
  bestScore,
  onPress,
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.dateRow}>
        <Ionicons
          name="calendar-outline"
          size={13}
          color={colors.textSecondary}
        />
        <Text style={styles.date}>{date}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.info}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>{attempts} attempts total</Text>
        </View>
        <View style={styles.stats}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>LATEST</Text>
            <Text style={styles.statValue}>
              {latestScore != null ? latestScore.toFixed(1) : "--"}
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>BEST</Text>
            <Text style={[styles.statValue, styles.bestValue]}>
              {bestScore != null ? bestScore.toFixed(1) : "--"}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginBottom: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    date: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: spacing.xs,
    },
    body: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    info: {
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.navy,
    },
    meta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    stats: {
      flexDirection: "row",
    },
    statBlock: {
      alignItems: "center",
      marginLeft: spacing.md,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.textSecondary,
      letterSpacing: 0.4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.navy,
      marginTop: 2,
    },
    bestValue: {
      color: colors.accent,
    },
  });
}
