import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import LogoMark from "../ui/LogoMark";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function SplashScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  return (
    <View style={styles.container}>
      <LogoMark size={180} />
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
      alignItems: "center",
      justifyContent: "center",
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
