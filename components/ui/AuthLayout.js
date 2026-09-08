import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function AuthLayout({ children }) {
  const { colors } = useAppTheme();
  const scheme = useColorScheme();
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
        <BlurView
          intensity={40}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={styles.card}
        >
          <View style={styles.cardOverlay}>{children}</View>
        </BlurView>
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
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardBorder,
    },
    cardOverlay: {
      backgroundColor: colors.card,
      padding: spacing.xl,
    },
  });
}