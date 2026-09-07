import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AuthTextField from "../ui/AuthTextField";
import SelectField from "../ui/SelectField";
import PrimaryButton from "../ui/PrimaryButton";
import { createSession } from "../../constants/mockSessions";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

const DURATION_OPTIONS = ["5 minutes", "8 minutes", "10 minutes", "15 minutes"];

function getUpcomingDates(count) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return formatter.format(date);
  });
}

const DATE_OPTIONS = getUpcomingDates(14);

export default function CreateSessionScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(DURATION_OPTIONS[1]);
  const [date, setDate] = useState(DATE_OPTIONS[0]);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const canSubmit = title.trim().length > 0;

  const handleCreate = () => {
    if (!canSubmit) return;
    const targetMinutes = parseInt(duration, 10);
    const id = createSession({
      title: title.trim(),
      description: description.trim(),
      targetMinutes,
      date,
    });
    router.replace(`/session/${id}`);
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Practice Session</Text>
      </View>

      <Text style={styles.subtitle}>What are you practising for?</Text>

      <AuthTextField
        label="Presentation title *"
        placeholder="DSW Final Presentation"
        icon="document-text-outline"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
      />

      <AuthTextField
        label="About this presentation"
        placeholder="University project about..."
        value={description}
        onChangeText={setDescription}
        autoCapitalize="sentences"
        multiline
        numberOfLines={3}
      />

      <SelectField
        label="Target duration"
        icon="time-outline"
        value={duration}
        options={DURATION_OPTIONS}
        onChange={setDuration}
      />

      <SelectField
        label="Presentation date"
        icon="calendar-outline"
        value={date}
        options={DATE_OPTIONS}
        onChange={setDate}
      />

      <PrimaryButton
        label="CREATE SESSION"
        onPress={handleCreate}
        style={!canSubmit && styles.disabledButton}
      />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerTitle: {
      ...typography.heading,
      fontSize: 20,
      marginLeft: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      fontSize: 15,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
}
