import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SessionProgressCard({ title, attempts, latestScore, onPress }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{attempts} attempts</Text>
      <Text style={styles.meta}>Latest: {latestScore.toFixed(1)} / 10</Text>
      <TouchableOpacity style={styles.cta} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.ctaLabel}>Continue Practising</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginRight: spacing.xs,
  },
  });
}
