import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/ThemeContext';

export default function BrandTitle({ style }) {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="mic" size={20} color="#FFFFFF" />
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
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  title: {
    ...typography.brand,
  },
  });
}
