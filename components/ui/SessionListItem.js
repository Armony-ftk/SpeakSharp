import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SessionListItem({ title, attempts, latestScore, onPress }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {attempts} attempts • {latestScore.toFixed(1)} / 10
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  textWrap: {
    flexShrink: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  });
}
