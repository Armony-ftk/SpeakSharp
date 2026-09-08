import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AuthTextField from "../ui/AuthTextField";
import PrimaryButton from "../ui/PrimaryButton";
import { getProfile, updateProfile } from "../../constants/mockProfile";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function EditProfileScreen() {
  const [name, setName] = useState(() => getProfile().name);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSave = () => {
    if (!name.trim()) return;
    updateProfile({ name: name.trim() });
    router.back();
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      <AuthTextField
        label="Full Name"
        placeholder="Jane Doe"
        icon="person-outline"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <PrimaryButton label="SAVE CHANGES" onPress={handleSave} />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.lg,
    },
    headerTitle: {
      ...typography.heading,
      fontSize: 20,
      marginLeft: spacing.sm,
    },
  });
}
