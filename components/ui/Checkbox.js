import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function Checkbox({ checked, onToggle, children }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={13} color={colors.card} /> : null}
      </View>
      <View style={styles.textContainer}>{children}</View>
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.sm / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  textContainer: {
    flex: 1,
  },
  });
}
