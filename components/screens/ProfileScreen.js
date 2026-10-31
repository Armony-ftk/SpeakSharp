import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AppHeader from "../ui/AppHeader";
import ProfileStatCard from "../ui/ProfileStatCard";
import EmptyState from "../ui/EmptyState";
import PrimaryButton from "../ui/PrimaryButton";
import { useAccountData } from "../../context/AccountDataContext";
import { getFullName, getInitials, formatMemberSince } from "../../utils/profile";
import { formatProgressRating } from "../../utils/progressStats";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

export default function ProfileScreen() {
  const { profile, sessions, progress, loading, errorMessage, retry,
    profileLoading, profileErrorMessage, retryProfile } = useAccountData();
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const fullName = getFullName(profile?.fullName);
  const active = sessions.some((session) => session.status === "active");
  const delta = progress.comparison.rating?.delta;
  const badgeLabel = !Number.isFinite(delta) ? "—"
    : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;

  return (
    <ScreenContainer>
      <AppHeader
        rightIcon="settings-outline"
        onRightPress={() => router.push("/settings")}
      />

      {profileLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {profileErrorMessage ? (
        <EmptyState title="Profile unavailable" description={profileErrorMessage}
          actionLabel="TRY AGAIN" onAction={retryProfile} />
      ) : null}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(fullName) || "?"}</Text>
        </View>
        <Text style={styles.name}>{profileLoading ? "Loading profile..." : fullName || "Name unavailable"}</Text>
        <Text style={styles.memberSince}>
          Member since {formatMemberSince(profile?.createdAt)}
        </Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push("/edit-profile")}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil-outline" size={14} color={colors.navy} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your Stats</Text>
      {loading ? <ActivityIndicator color={colors.accent} /> : errorMessage ? (
        <>
          <Text style={styles.memberSince}>{errorMessage}</Text>
          <PrimaryButton label="TRY AGAIN" onPress={retry} />
        </>
      ) : (
        <>
          <ProfileStatCard
            icon="mic-outline"
            badgeLabel={active ? "Active" : "Inactive"}
            badgeTone={active ? "positive" : "neutral"}
            label="Total Sessions"
            value={progress.overview.sessions}
          />
          <ProfileStatCard
            icon="star-outline"
            badgeLabel={badgeLabel}
            badgeTone={delta > 0 ? "positive" : "neutral"}
            label="Average Score"
            value={formatProgressRating(progress.overview.average)}
          />
        </>
      )}
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    avatarSection: {
      alignItems: "center",
      marginBottom: spacing.md,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
      shadowColor: "#101828",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: "800",
      color: "#FFFFFF",
    },
    name: {
      ...typography.heading,
      fontSize: 20,
    },
    memberSince: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    editButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.pill,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    editButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.navy,
      marginLeft: spacing.xs,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.navy,
      marginBottom: spacing.md,
      marginTop: spacing.sm,
    },
  });
}
