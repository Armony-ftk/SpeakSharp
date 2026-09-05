import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function ScreenContainer({ children, contentStyle, floatingAction }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
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
  });
}
