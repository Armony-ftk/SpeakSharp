import { StyleSheet, View } from "react-native";
import { radius } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ProgressBar({ progress = 0 }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    track: {
      height: 8,
      borderRadius: radius.pill,
      backgroundColor: colors.inputBackground,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
    },
  });
}
