import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import AuthTextField from "../ui/AuthTextField";
import SelectField from "../ui/SelectField";
import PrimaryButton from "../ui/PrimaryButton";
import { spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import {
  createSession,
  getSessionById,
  getSessionErrorMessage,
  updateSession,
} from "../../services/sessionService";

const NO_DURATION = "No target";
const NO_DATE = "No date";
const DURATION_OPTIONS = [
  NO_DURATION,
  "5 minutes",
  "8 minutes",
  "10 minutes",
  "15 minutes",
];
const STATUS_OPTIONS = ["Active", "Completed"];

function getUpcomingDates(count) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { label: formatter.format(date), date };
  });
}

const UPCOMING_DATES = getUpcomingDates(14);
const UPCOMING_DATE_OPTIONS = UPCOMING_DATES.map(({ label }) => label);

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function durationToLabel(seconds) {
  if (!seconds) return NO_DURATION;
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${seconds} seconds`;
}

function durationToSeconds(label) {
  if (label === NO_DURATION) return null;
  const amount = Number.parseInt(label, 10);
  return label.includes("second") ? amount : amount * 60;
}

function toFormDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime());
}

function dateToLabel(value) {
  const date = toFormDate(value);
  if (!date) return NO_DATE;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function CreateSessionScreen() {
  const params = useLocalSearchParams();
  const sessionId = firstParam(params.sessionId);
  const isEditing = Boolean(sessionId);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [duration, setDuration] = useState("8 minutes");
  const [presentationDateLabel, setPresentationDateLabel] = useState(
    UPCOMING_DATES[0].label,
  );
  const [presentationDate, setPresentationDate] = useState(
    () => new Date(UPCOMING_DATES[0].date.getTime()),
  );
  const [status, setStatus] = useState("Active");
  const [extraDurationOption, setExtraDurationOption] = useState(null);
  const [extraDateOption, setExtraDateOption] = useState(null);
  const [loadingSession, setLoadingSession] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const submissionInProgress = useRef(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  const durationOptions = useMemo(
    () =>
      extraDurationOption && !DURATION_OPTIONS.includes(extraDurationOption)
        ? [extraDurationOption, ...DURATION_OPTIONS]
        : DURATION_OPTIONS,
    [extraDurationOption],
  );
  const dateOptions = useMemo(
    () => {
      const options = [NO_DATE, ...UPCOMING_DATE_OPTIONS];
      return extraDateOption && !options.includes(extraDateOption.label)
        ? [extraDateOption.label, ...options]
        : options;
    },
    [extraDateOption],
  );

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadSession() {
      setLoadingSession(true);
      setErrorMessage("");
      try {
        const session = await getSessionById(sessionId);
        if (!session) {
          throw new Error("This session no longer exists.");
        }
        if (cancelled) return;

        const durationLabel = durationToLabel(session.targetDurationSeconds);
        const formDate = toFormDate(session.presentationDate);
        const dateLabel = dateToLabel(formDate);
        setTitle(session.title);
        setContext(session.context ?? "");
        setDuration(durationLabel);
        setPresentationDateLabel(dateLabel);
        setPresentationDate(formDate);
        setStatus(session.status === "completed" ? "Completed" : "Active");
        setExtraDurationOption(durationLabel);
        setExtraDateOption(
          formDate ? { label: dateLabel, date: formDate } : null,
        );
      } catch (error) {
        if (!cancelled) setErrorMessage(getSessionErrorMessage(error));
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const canSubmit = title.trim().length > 0 && !loadingSession;

  const handlePresentationDateChange = (label) => {
    if (label === NO_DATE) {
      setPresentationDateLabel(label);
      setPresentationDate(null);
      return;
    }

    const selectedDate =
      UPCOMING_DATES.find((option) => option.label === label) ??
      (extraDateOption?.label === label ? extraDateOption : null);
    if (!selectedDate) return;

    setPresentationDateLabel(label);
    setPresentationDate(new Date(selectedDate.date.getTime()));
  };

  const handleSave = async () => {
    if (!canSubmit || submissionInProgress.current) return;

    submissionInProgress.current = true;
    setErrorMessage("");
    setSubmitting(true);
    const sessionData = {
      title,
      context,
      targetDurationSeconds: durationToSeconds(duration),
      presentationDate,
    };

    try {
      let savedSessionId = sessionId;
      if (isEditing) {
        await updateSession(sessionId, {
          ...sessionData,
          status: status.toLowerCase(),
        });
      } else {
        savedSessionId = await createSession(sessionData);
      }
      router.replace(`/session/${savedSessionId}`);
    } catch (error) {
      setErrorMessage(getSessionErrorMessage(error));
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Practice Session" : "New Practice Session"}
        </Text>
      </View>

      <Text style={styles.subtitle}>What are you practising for?</Text>

      <AuthTextField
        label="Presentation title *"
        placeholder="DSW Final Presentation"
        icon="document-text-outline"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
        editable={!loadingSession && !submitting}
      />

      <AuthTextField
        label="About this presentation"
        placeholder="University project about..."
        value={context}
        onChangeText={setContext}
        autoCapitalize="sentences"
        multiline
        numberOfLines={3}
        editable={!loadingSession && !submitting}
      />

      <SelectField
        label="Target duration"
        icon="time-outline"
        value={duration}
        options={durationOptions}
        onChange={setDuration}
      />

      <SelectField
        label="Presentation date"
        icon="calendar-outline"
        value={presentationDateLabel}
        options={dateOptions}
        onChange={handlePresentationDateChange}
      />

      {isEditing ? (
        <SelectField
          label="Status"
          icon="checkmark-circle-outline"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
      ) : null}

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <PrimaryButton
        label={isEditing ? "SAVE CHANGES" : "CREATE SESSION"}
        loadingLabel={isEditing ? "SAVING..." : "CREATING..."}
        loading={submitting}
        disabled={!canSubmit}
        onPress={handleSave}
      />
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
    subtitle: {
      ...typography.body,
      fontSize: 15,
      marginBottom: spacing.lg,
    },
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
  });
}
