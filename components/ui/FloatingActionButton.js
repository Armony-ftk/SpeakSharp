import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

export default function FloatingActionButton({ onPress, icon = 'add' }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);

  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={26} color={colors.card} />
    </TouchableOpacity>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  });
}
