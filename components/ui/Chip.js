import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function Chip({ label }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  chip: {
    backgroundColor: colors.inputBackground,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navySoft,
  },
  });
}
