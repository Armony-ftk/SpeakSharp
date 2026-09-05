import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function AppHeader({ showBack = true, online = true, rightIcon, onRightPress }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.side}
        onPress={() => router.canGoBack() && router.back()}
        hitSlop={8}
      >
        {showBack ? <Ionicons name="arrow-back" size={20} color={colors.textPrimary} /> : null}
      </TouchableOpacity>
      <Text style={styles.title}>SpeakSharp</Text>
      <TouchableOpacity
        style={[styles.side, styles.sideRight]}
        onPress={onRightPress}
        disabled={!onRightPress}
        hitSlop={8}
      >
        <Ionicons
          name={rightIcon ?? (online ? 'wifi' : 'wifi-outline')}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  side: {
    width: 32,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  });
}
