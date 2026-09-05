import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function PrimaryButton({ label, onPress, loading, style, icon, pill }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.button, pill && styles.buttonPill, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.card} />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={16} color={colors.card} style={styles.icon} />
          ) : null}
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  button: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonPill: {
    borderRadius: radius.pill,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  });
}
