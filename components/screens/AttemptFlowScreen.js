import { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import PrimaryButton from "../ui/PrimaryButton";
import StatCard from "../ui/StatCard";
import Waveform from "../ui/Waveform";
import Chip from "../ui/Chip";
import ConfirmDialog from "../ui/ConfirmDialog";
import { getSession } from "../../constants/mockSessions";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";

const PROCESSING_STEPS = [
  "Recording uploaded",
  "Transcript generated",
  "Speaking metrics calculated",
  "Generating AI feedback",
];

const MOCK_TRANSCRIPT =
  "Good afternoon everyone.\n\nToday we are presenting our React Native application.\n\nThe application uses Firebase for authentication...";

// Mock data standing in for a real analysis API.
const FEEDBACK = {
  score: 8.2,
  previousScore: 6.8,
  previousAttempt: 4,
  metrics: [
    { label: "Duration", value: "7:43", subtitle: "Target 8:00" },
    { label: "Words", value: "923", subtitle: "Total Count" },
    { label: "Pace", value: "119 wpm", subtitle: "Steady" },
    { label: "Fillers", value: "8", subtitle: "Needs attention" },
  ],
  whatWentWell: [
    "Clear problem statement",
    "Logical flow",
    "Strong explanation",
  ],
  improveNext: [
    "Strengthen your conclusion",
    "Reduce repetition",
    "Slow down during introduction",
  ],
  fillerWords: [
    { word: "um", count: 4 },
    { word: "like", count: 2 },
    { word: "basically", count: 2 },
  ],
  nextStep: "Focus on your conclusion in your next attempt.",
  scoreBreakdown: [
    { label: "Structure", value: "8.0 / 10" },
    { label: "Clarity", value: "8.4 / 10" },
    { label: "Relevance", value: "8.5 / 10" },
    { label: "Conciseness", value: "7.9 / 10" },
  ],
};

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AttemptFlowScreen() {
  const { id, view } = useLocalSearchParams();
  const session = getSession(id);
  const attemptNumber = session.attempts + 1;

  const [phase, setPhase] = useState(
    view === "feedback" ? "feedback" : "recording",
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStep, setProcessingStep] = useState(0);
  const [transcript, setTranscript] = useState(MOCK_TRANSCRIPT);
  const [savedChanges, setSavedChanges] = useState(true);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [reflection, setReflection] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [showDeleteRecording, setShowDeleteRecording] = useState(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    if (phase !== "recording") return;
    const interval = setInterval(
      () => setElapsedSeconds((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "processing") return;
    if (processingStep >= PROCESSING_STEPS.length) {
      const timeout = setTimeout(() => setPhase("transcript"), 500);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(
      () => setProcessingStep((prev) => prev + 1),
      700,
    );
    return () => clearTimeout(timeout);
  }, [phase, processingStep]);

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  const handleStop = () => setPhase("review");
  const handleRecordAgain = () => {
    setElapsedSeconds(0);
    setPhase("recording");
  };
  const handleDiscard = () => router.back();
  const handleUseRecording = () => {
    setProcessingStep(0);
    setPhase("processing");
  };
  const handleTranscriptChange = (text) => {
    setTranscript(text);
    setSavedChanges(false);
  };
  const handleAnalyse = () => setPhase("feedback");
  const handleRecordAnother = () => {
    setElapsedSeconds(0);
    setProcessingStep(0);
    setTranscript(MOCK_TRANSCRIPT);
    setSavedChanges(true);
    setShowScoreInfo(false);
    setReflection("");
    setNoteSaved(false);
    setPhase("recording");
  };
  const handleBackToSession = () => router.back();

  if (phase === "recording" || phase === "paused") {
    const isPaused = phase === "paused";
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.attemptTitle}>{session.title}</Text>
        <Text style={styles.attemptSubtitle}>Attempt {attemptNumber}</Text>

        <View style={styles.recordingBody}>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, isPaused && styles.statusDotPaused]}
            />
            <Text style={styles.statusLabel}>
              {isPaused ? "PAUSED" : "RECORDING"}
            </Text>
          </View>
          <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
          <Waveform progress={isPaused ? 0.4 : 1} />
        </View>

        <PrimaryButton
          label={isPaused ? "RESUME" : "PAUSE"}
          icon={isPaused ? "play" : "pause"}
          pill
          onPress={() => setPhase(isPaused ? "recording" : "paused")}
        />
        <TouchableOpacity onPress={handleStop} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>STOP</Text>
        </TouchableOpacity>

        <View style={styles.offlineNote}>
          <Ionicons
            name="cloud-offline-outline"
            size={14}
            color={colors.textSecondary}
          />
          <Text style={styles.offlineNoteText}>
            Recording continues to work without internet.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (phase === "review") {
    return (
      <ScreenContainer>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Recording</Text>
        </View>
        <Text style={styles.attemptSubtitle}>Attempt {attemptNumber}</Text>

        <View style={styles.reviewCard}>
          <Waveform progress={0.35} color={colors.accent} />
          <Text style={styles.reviewPosition}>
            0:00 / {formatDuration(elapsedSeconds)}
          </Text>
        </View>

        <PrimaryButton
          label="RECORD AGAIN"
          icon="mic"
          pill
          onPress={handleRecordAgain}
        />
        <TouchableOpacity
          onPress={() => setShowDeleteRecording(true)}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>Delete recording</Text>
        </TouchableOpacity>
        <PrimaryButton
          label="USE THIS RECORDING"
          onPress={handleUseRecording}
          style={styles.useRecordingButton}
        />

        <ConfirmDialog
          visible={showDeleteRecording}
          title="Delete this recording?"
          message="This attempt will be permanently removed."
          confirmLabel="Delete"
          destructive
          onCancel={() => setShowDeleteRecording(false)}
          onConfirm={handleDiscard}
        />
      </ScreenContainer>
    );
  }

  if (phase === "processing") {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <Text style={styles.processingTitle}>Analysing your presentation</Text>
        {PROCESSING_STEPS.map((step, index) => {
          const done = index < processingStep;
          const active = index === processingStep;
          return (
            <View key={step} style={styles.processingRow}>
              <Ionicons
                name={
                  done
                    ? "checkmark-circle"
                    : active
                      ? "ellipse"
                      : "ellipse-outline"
                }
                size={18}
                color={
                  done ? colors.success : active ? colors.accent : colors.border
                }
              />
              <Text
                style={[
                  styles.processingLabel,
                  !done && !active && styles.processingLabelPending,
                ]}
              >
                {step}
              </Text>
            </View>
          );
        })}
        <Text style={styles.processingHint}>This may take a moment...</Text>
      </ScreenContainer>
    );
  }

  if (phase === "transcript") {
    return (
      <ScreenContainer>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Transcript</Text>
        </View>
        <Text style={styles.attemptSubtitle}>Attempt {attemptNumber}</Text>

        <Text style={styles.transcriptHeading}>Check your transcript</Text>
        <Text style={styles.transcriptSubtitle}>
          Correct names, terminology and obvious transcription mistakes.
        </Text>

        <TextInput
          style={styles.transcriptInput}
          value={transcript}
          onChangeText={handleTranscriptChange}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.wordCount}>{wordCount} words</Text>

        <TouchableOpacity
          onPress={() => setSavedChanges(true)}
          style={styles.textButton}
        >
          <Text style={styles.textButtonLabel}>
            {savedChanges ? "Changes saved" : "Save Changes"}
          </Text>
        </TouchableOpacity>

        <PrimaryButton label="ANALYSE PRESENTATION" onPress={handleAnalyse} />
      </ScreenContainer>
    );
  }

  // phase === 'feedback'
  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={handleBackToSession} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attempt {attemptNumber} Analysis</Text>
        <Ionicons name="wifi" size={16} color={colors.textSecondary} />
      </View>

      <Text style={styles.scoreLabel}>OVERALL SCORE</Text>
      <Text style={styles.scoreValue}>{FEEDBACK.score.toFixed(1)}</Text>
      <Text style={styles.scoreMax}>/ 10</Text>
      <Text style={styles.scoreDelta}>
        ↑ +{(FEEDBACK.score - FEEDBACK.previousScore).toFixed(1)} from Attempt{" "}
        {FEEDBACK.previousAttempt}
      </Text>
      <TouchableOpacity onPress={() => setShowScoreInfo(true)}>
        <Text style={styles.scoreInfoLink}>How is this score calculated?</Text>
      </TouchableOpacity>

      <View style={styles.nextStepCard}>
        <View style={styles.nextStepHeader}>
          <Ionicons name="megaphone-outline" size={14} color={colors.navy} />
          <Text style={styles.nextStepLabel}>YOUR NEXT STEP</Text>
        </View>
        <Text style={styles.nextStepText}>{FEEDBACK.nextStep}</Text>
        <PrimaryButton
          label="RECORD ANOTHER ATTEMPT"
          icon="mic"
          pill
          onPress={handleRecordAnother}
        />
      </View>

      <Text style={styles.heading}>Speaking Metrics</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricsRow}>
          <StatCard {...FEEDBACK.metrics[0]} />
          <StatCard {...FEEDBACK.metrics[1]} />
        </View>
        <View style={styles.metricsRow}>
          <StatCard {...FEEDBACK.metrics[2]} />
          <StatCard {...FEEDBACK.metrics[3]} />
        </View>
      </View>

      <View style={styles.listCard}>
        <View style={styles.cardHeaderRow}>
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={colors.success}
          />
          <Text style={styles.cardHeading}>WHAT YOU DID WELL</Text>
        </View>
        {FEEDBACK.whatWentWell.map((item, index) => (
          <View key={item} style={styles.numberedRow}>
            <View style={styles.numberedBadge}>
              <Text style={styles.numberedBadgeText}>{index + 1}</Text>
            </View>
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.listCard}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="bulb-outline" size={16} color={colors.accent} />
          <Text style={styles.cardHeading}>IMPROVE NEXT</Text>
        </View>
        {FEEDBACK.improveNext.map((item, index) => (
          <View key={item} style={styles.numberedRow}>
            <View style={styles.numberedBadge}>
              <Text style={styles.numberedBadgeText}>{index + 1}</Text>
            </View>
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>FILLER WORDS BREAKDOWN</Text>
      <View style={styles.chipRow}>
        {FEEDBACK.fillerWords.map((item) => (
          <Chip key={item.word} label={`"${item.word}" ${item.count}`} />
        ))}
      </View>

      <Text style={styles.heading}>Reflection Note</Text>
      <View style={styles.listCard}>
        <TextInput
          style={styles.reflectionInput}
          value={reflection}
          onChangeText={(text) => {
            setReflection(text);
            setNoteSaved(false);
          }}
          placeholder="What will you focus on next?"
          placeholderTextColor={colors.placeholder}
        />
        <TouchableOpacity
          onPress={() => setNoteSaved(true)}
          style={styles.saveNoteButton}
        >
          <Text style={styles.saveNoteButtonText}>
            {noteSaved ? "Note saved" : "Save Note"}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleBackToSession}
        style={styles.backToSessionLink}
      >
        <Text style={styles.backToSessionText}>Back to Session</Text>
      </TouchableOpacity>

      <Modal
        visible={showScoreInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScoreInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How your score works</Text>
            {FEEDBACK.scoreBreakdown.map((item) => (
              <View key={item.label} style={styles.structureRow}>
                <Text style={styles.structureLabel}>{item.label}</Text>
                <Text style={styles.structureValue}>{item.value}</Text>
              </View>
            ))}
            <Text style={styles.modalDescription}>
              Your SpeakSharp rating is a coaching score designed to help you
              track improvement between attempts. It is not a prediction of your
              university mark.
            </Text>
            <PrimaryButton
              label="Done"
              onPress={() => setShowScoreInfo(false)}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    centeredContent: {
      flexGrow: 1,
      alignItems: "center",
    },
    backButton: {
      alignSelf: "flex-start",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: {
      ...typography.heading,
      fontSize: 18,
      flex: 1,
      marginHorizontal: spacing.sm,
    },
    heading: {
      ...typography.heading,
      fontSize: 17,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    attemptTitle: {
      ...typography.heading,
      fontSize: 18,
      marginTop: spacing.lg,
      textAlign: "center",
    },
    attemptSubtitle: {
      ...typography.body,
      marginTop: spacing.xs,
      textAlign: "center",
    },
    recordingBody: {
      alignItems: "center",
      marginVertical: spacing.xl,
      width: "100%",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#E4351F",
      marginRight: spacing.xs,
    },
    statusDotPaused: {
      backgroundColor: colors.placeholder,
    },
    statusLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: colors.textSecondary,
    },
    timer: {
      fontSize: 40,
      fontWeight: "800",
      color: colors.navy,
      marginBottom: spacing.lg,
    },
    textButton: {
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    textButtonLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    offlineNote: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.lg,
    },
    offlineNoteText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: spacing.xs,
    },
    reviewCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginBottom: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    reviewPosition: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      textAlign: "center",
    },
    useRecordingButton: {
      marginTop: spacing.sm,
    },
    processingTitle: {
      ...typography.heading,
      fontSize: 18,
      marginBottom: spacing.xl,
      textAlign: "center",
    },
    processingRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      marginBottom: spacing.md,
    },
    processingLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navy,
      marginLeft: spacing.sm,
    },
    processingLabelPending: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    processingHint: {
      ...typography.body,
      marginTop: spacing.md,
    },
    transcriptHeading: {
      ...typography.heading,
      fontSize: 18,
      marginTop: spacing.lg,
    },
    transcriptSubtitle: {
      ...typography.body,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    transcriptInput: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      minHeight: 180,
      fontSize: 14,
      color: colors.textPrimary,
    },
    wordCount: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
      marginTop: spacing.lg,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    scoreLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      letterSpacing: 0.6,
      textAlign: "center",
      marginTop: spacing.lg,
    },
    scoreValue: {
      fontSize: 44,
      fontWeight: "800",
      color: colors.navy,
      textAlign: "center",
    },
    scoreMax: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
    scoreDelta: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.success,
      marginTop: spacing.sm,
      textAlign: "center",
    },
    scoreInfoLink: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent,
      textDecorationLine: "underline",
      marginTop: spacing.xs,
      textAlign: "center",
    },
    nextStepCard: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    nextStepHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    nextStepLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.navy,
      letterSpacing: 0.6,
      marginLeft: spacing.xs,
    },
    nextStepText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.navySoft,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    metricsGrid: {
      gap: spacing.sm,
    },
    metricsRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    structureCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    structureRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: spacing.xs,
    },
    structureLabel: {
      fontSize: 13,
      color: colors.navySoft,
    },
    structureValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.navy,
    },
    listCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.md,
      marginTop: spacing.md,
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    cardHeading: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.navy,
      letterSpacing: 0.6,
      marginLeft: spacing.xs,
    },
    checklistRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    checklistText: {
      fontSize: 13,
      color: colors.navySoft,
      marginLeft: spacing.xs,
      flexShrink: 1,
    },
    numberedRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    numberedBadge: {
      width: 18,
      height: 18,
      borderRadius: radius.pill,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.xs,
    },
    numberedBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.navySoft,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    reflectionPrompt: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.navySoft,
      marginBottom: spacing.sm,
    },
    reflectionInput: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    saveNoteButton: {
      alignSelf: "flex-end",
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
    },
    saveNoteButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    backToSessionLink: {
      alignItems: "center",
      marginTop: spacing.lg,
    },
    backToSessionText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(16, 24, 40, 0.5)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
    },
    modalTitle: {
      ...typography.heading,
      fontSize: 18,
      marginBottom: spacing.md,
    },
    modalDescription: {
      ...typography.body,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
  });
}
