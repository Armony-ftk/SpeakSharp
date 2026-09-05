import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function StatCard({ value, label, valueColor, subtitle, subtitleColor }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor && { color: valueColor }]}>{value}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, subtitleColor && { color: subtitleColor }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  });
}
