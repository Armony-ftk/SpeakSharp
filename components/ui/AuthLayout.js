import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function AuthLayout({ children }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 3,
  },
  });
}
