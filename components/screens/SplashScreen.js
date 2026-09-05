import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SplashScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="mic" size={56} color={colors.navy} />
        <Ionicons name="trending-up" size={30} color={colors.accent} style={styles.arrow} />
      </View>
      <Text style={styles.title}>SpeakSharp</Text>
      <Text style={styles.tagline}>Practice. Improve. Repeat.</Text>
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
    </View>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 72,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  arrow: {
    position: 'absolute',
    top: -8,
    right: -12,
  },
  title: {
    ...typography.brand,
    fontSize: 32,
  },
  tagline: {
    ...typography.body,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.sm,
  },
  });
}
