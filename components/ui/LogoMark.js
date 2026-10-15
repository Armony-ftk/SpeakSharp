import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../constants/ThemeContext";

export default function LogoMark({ size = 140 }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const iconSize = Math.round(size * 0.3);
  const arrowSize = Math.round(size * 0.16);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="mic" size={iconSize} color={colors.navy} />
        <Ionicons
          name="trending-up"
          size={arrowSize}
          color={colors.accent}
          style={[
            styles.arrow,
            { top: -iconSize * 0.25, right: -iconSize * 0.35 },
          ]}
        />
      </View>
      <Text style={[styles.label, { fontSize: size * 0.13 }]}>SpeakSharp</Text>
    </View>
  );
}

function getStyles(colors) {
  return StyleSheet.create({
    circle: {
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrap: {
      marginBottom: 4,
    },
    arrow: {
      position: "absolute",
    },
    label: {
      fontWeight: "800",
      color: colors.navy,
    },
  });
}
