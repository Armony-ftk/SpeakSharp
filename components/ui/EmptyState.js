import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';
import PrimaryButton from './PrimaryButton';

export default function EmptyState({ icon = 'mic-outline', title, description, actionLabel, onAction }) {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={26} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <PrimaryButton label={actionLabel} onPress={onAction} style={styles.button} />
    </View>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  button: {
    alignSelf: 'stretch',
  },
  });
}
