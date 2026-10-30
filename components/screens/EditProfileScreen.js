import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AuthTextField from "../ui/AuthTextField";
import PrimaryButton from "../ui/PrimaryButton";
import { useAccountData } from "../../context/AccountDataContext";
import { updateFullName } from "../../services/profileService";
import { getFullName } from "../../utils/profile";
import { auth } from "../../config/firebase";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function EditProfileScreen() {
  const { uid, profile, profileLoading, profileErrorMessage, retryProfile } = useAccountData();
  // A draft wins over subsequent snapshots, including latency-compensated writes.
  const [draft, setDraft] = useState(null);
  const name = draft ?? getFullName(profile?.fullName);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const savingRef = useRef(false);
  const activeRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const handleSave = async () => {
    if (savingRef.current || profileLoading || profileErrorMessage || !profile || !uid) return;
    const fullName = name.trim();
    if (!fullName) {
      setErrorMessage("Enter your full name.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setErrorMessage("");
    try {
      await updateFullName(uid, fullName);
      if (activeRef.current && auth.currentUser?.uid === uid) router.back();
    } catch {
      if (activeRef.current && auth.currentUser?.uid === uid) {
        setErrorMessage("Could not save your name. Check your connection and try again.");
      }
    } finally {
      savingRef.current = false;
      if (activeRef.current) setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      {profileLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {profileErrorMessage ? (
        <>
          <Text style={styles.errorText}>{profileErrorMessage}</Text>
          <PrimaryButton label="RETRY PROFILE" onPress={retryProfile} />
        </>
      ) : !profileLoading && !profile ? (
        <Text style={styles.errorText}>Your profile is missing. Please contact support.</Text>
      ) : null}

      <AuthTextField
        label="Full Name"
        placeholder="Full name"
        icon="person-outline"
        value={name}
        onChangeText={setDraft}
        autoCapitalize="words"
        editable={!profileLoading && !profileErrorMessage && Boolean(profile) && !saving}
      />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <PrimaryButton label="SAVE CHANGES" onPress={handleSave}
        loading={saving} loadingLabel="SAVING..."
        disabled={profileLoading || Boolean(profileErrorMessage) || !profile || !uid} />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      marginBottom: spacing.sm,
    },
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
