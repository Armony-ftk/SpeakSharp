import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SelectField({ label, icon, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.8}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.placeholder} style={styles.icon} />
        ) : null}
        <Text style={styles.value}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.placeholder} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, option === value && styles.optionTextActive]}>
                  {option}
                </Text>
                {option === value ? (
                  <Ionicons name="checkmark" size={18} color={colors.accent} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navySoft,
    marginBottom: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
  },
  icon: {
    marginRight: spacing.sm,
  },
  value: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.heading,
    fontSize: 17,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontSize: 15,
    color: colors.navySoft,
  },
  optionTextActive: {
    fontWeight: '700',
    color: colors.navy,
  },
  });
}
