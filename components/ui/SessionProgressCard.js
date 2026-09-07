import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function SessionProgressCard({ title, attempts, latestScore, onPress }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Text style={styles.meta}>{attempts} attempts</Text>
      <View style={styles.footer}>
        <Text style={styles.score}>
          Latest: <Text style={styles.scoreValue}>{latestScore.toFixed(1)}</Text> / 10
        </Text>
        <TouchableOpacity style={styles.resumeButton} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.resumeLabel}>Resume</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    card: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      shadowColor: '#101828',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    meta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    score: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    scoreValue: {
      fontWeight: '700',
      color: colors.navy,
    },
    resumeButton: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    resumeLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
  });
}