import { StyleSheet, View } from 'react-native';
import { radius } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

// Static pseudo-waveform used as a visual stand-in (no real audio analysis yet).
const BAR_HEIGHTS = [8, 16, 24, 14, 30, 20, 10, 26, 18, 32, 12, 22, 28, 16, 8, 20, 24, 14, 30, 10];

export default function Waveform({ progress = 0, color, trackColor }) {
  const { colors } = useAppTheme();
  const resolvedColor = color ?? colors.navy;
  const resolvedTrackColor = trackColor ?? colors.border;
  const styles = getStyles();
  const activeBars = Math.round(BAR_HEIGHTS.length * progress);

  return (
    <View style={styles.row}>
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { height, backgroundColor: index < activeBars ? resolvedColor : resolvedTrackColor },
          ]}
        />
      ))}
    </View>
  );
}

function getStyles() {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
  },
  bar: {
    width: 3,
    borderRadius: radius.pill,
  },
  });
}
