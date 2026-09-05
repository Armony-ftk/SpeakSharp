import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function OrDivider({ label = 'OR CONTINUE WITH' }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  label: {
    marginHorizontal: spacing.sm,
    fontSize: 11,
    fontWeight: '600',
    color: colors.placeholder,
    letterSpacing: 0.4,
  },
  });
}
