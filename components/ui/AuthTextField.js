import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function AuthTextField({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  helperText,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline,
  numberOfLines,
  style,
}) {
  const [isSecure, setIsSecure] = useState(!!secureTextEntry);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrapper, multiline && styles.inputWrapperMultiline]}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.placeholder} style={styles.icon} />
        ) : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setIsSecure((prev) => !prev)} hitSlop={8}>
            <Ionicons
              name={isSecure ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.placeholder}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  inputWrapperMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: spacing.xs,
  },
  helperText: {
    ...typography.body,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  });
}
