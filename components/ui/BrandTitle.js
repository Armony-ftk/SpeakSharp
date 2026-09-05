import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/ThemeContext';

export default function BrandTitle({ style }) {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="mic" size={26} color={colors.navy} />
        <Ionicons name="trending-up" size={16} color={colors.accent} style={styles.arrow} />
      </View>
      <Text style={styles.title}>SpeakSharp</Text>
    </View>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 32,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  arrow: {
    position: 'absolute',
    top: -6,
    right: -8,
  },
  title: {
    ...typography.brand,
  },
  });
}
