import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function ScreenContainer({ children, contentStyle, floatingAction, admin = false, bottomInset = false }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={admin ? ['top', 'left', 'right'] : ['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          admin && styles.adminContent,
          bottomInset && { paddingBottom: spacing.xl + insets.bottom },
          contentStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps={admin ? 'handled' : undefined}
        keyboardDismissMode={admin ? 'on-drag' : undefined}
      >
        {children}
      </ScrollView>
      {floatingAction}
    </SafeAreaView>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  adminContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  });
}
