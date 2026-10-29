import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenContainer from "../ui/ScreenContainer";
import StatCard from "../ui/StatCard";
import ProgressBar from "../ui/ProgressBar";
import Chip from "../ui/Chip";
import PrimaryButton from "../ui/PrimaryButton";
import { useAppTheme } from "../../constants/ThemeContext";
import { radius, spacing } from "../../constants/theme";
import {
  FEEDBACK_CRITERIA, FEEDBACK_STRUCTURE, formatFeedbackNumber,
  formatFeedbackDuration, formatRecordingDate, getFillerEntries,
} from "../../utils/recordingFeedback";

// AttemptFlowScreen supplies a completed recording with validated feedback.
export default function RecordingFeedbackView({ recording, session, onBackToSession }) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, typography);
  const feedback = recording.aiFeedback;
  const metrics = recording.metrics ?? {};
  const title = typeof session?.title === "string" ? session.title.trim() : "";
  const date = formatRecordingDate(recording.createdAt);
  const target = Number.isFinite(session?.targetDurationSeconds) && session.targetDurationSeconds > 0
    ? `Target ${formatFeedbackDuration(session.targetDurationSeconds)}` : undefined;
  const fillers = getFillerEntries(metrics.fillerWords);

  const renderAssessments = (fields, values) => fields.map(([key, label]) => (
    <View key={key} style={styles.card}>
      <View style={styles.scoreRow}>
        <Text style={styles.cardTitle}>{label}</Text>
        <Text style={styles.score}>{values[key].score} / 10</Text>
      </View>
      <ProgressBar progress={values[key].score / 10} />
      <Text style={styles.assessmentText}>{values[key].feedback}</Text>
    </View>
  ));

  const renderList = (items) => (
    <View style={styles.card}>
      {items.map((item, index) => (
        <View key={`${index}:${item}`} style={styles.listRow}>
          <Text style={styles.listNumber}>{index + 1}.</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScreenContainer contentStyle={{ paddingBottom: spacing.xl + insets.bottom }}>
      <Text accessibilityRole="header" style={styles.title}>Recording Feedback</Text>
      {title ? <Text style={styles.presentationTitle}>{title}</Text> : null}
      {date ? <Text style={styles.metadata}>Recorded {date}</Text> : null}

      <View style={styles.ratingSection}>
        <View style={[styles.card, styles.ratingCard]}>
          <Text style={styles.ratingLabel}>SpeakSharp rating</Text>
          <Text style={styles.rating}>{feedback.overallRating}<Text style={styles.ratingMax}> / 10</Text></Text>
        </View>
        <Text style={styles.body}>{feedback.overallSummary}</Text>
        <Text style={styles.ratingExplanation}>A SpeakSharp coaching rating, not a predicted academic mark.</Text>
      </View>

      <Text accessibilityRole="header" style={styles.sectionTitle}>Speaking Statistics</Text>
      <View style={styles.statsRow}>
        <StatCard label="Duration" value={formatFeedbackDuration(recording.durationSeconds)} subtitle={target} />
        <StatCard label="Word count" value={formatFeedbackNumber(metrics.wordCount)} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Speaking pace" value={formatFeedbackNumber(metrics.wordsPerMinute)} subtitle="Words per minute" />
        <StatCard label="Filler words" value={formatFeedbackNumber(metrics.fillerCount)} />
      </View>

      <Text accessibilityRole="header" style={styles.sectionTitle}>Evaluation Criteria</Text>
      {renderAssessments(FEEDBACK_CRITERIA, feedback.criteriaScores)}

      <Text accessibilityRole="header" style={styles.sectionTitle}>Presentation Structure</Text>
      {renderAssessments(FEEDBACK_STRUCTURE, feedback.structureFeedback)}

      <Text accessibilityRole="header" style={styles.sectionTitle}>Key Strengths</Text>
      {renderList(feedback.strengths)}

      <Text accessibilityRole="header" style={styles.sectionTitle}>Priority Improvements</Text>
      {renderList(feedback.improvements)}

      <Text accessibilityRole="header" style={styles.sectionTitle}>Filler-word Breakdown</Text>
      <View style={styles.card}>
        {fillers === null ? <Text style={styles.body}>Filler-word breakdown unavailable.</Text>
          : fillers.length === 0 ? <Text style={styles.body}>No filler words detected.</Text>
            : <View style={styles.chips}>{fillers.map(([word, count]) => (
              <Chip key={word} label={`${word}: ${count}`} />
            ))}</View>}
      </View>

      <Text accessibilityRole="header" style={styles.sectionTitle}>Likely Audience Questions</Text>
      {renderList(feedback.audienceQuestions)}

      <PrimaryButton label="Back to Session" onPress={onBackToSession} style={styles.backButton} />
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    title: { ...typography.heading, fontSize: 24, textAlign: "center" },
    presentationTitle: { ...typography.heading, fontSize: 17, marginTop: spacing.sm },
    metadata: { ...typography.body, marginTop: spacing.xs },
    sectionTitle: { ...typography.heading, fontSize: 18, marginTop: spacing.lg, marginBottom: spacing.smd },
    card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1,
      borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
    ratingSection: { marginTop: spacing.lg },
    ratingCard: { alignItems: "center", padding: spacing.lg, marginBottom: spacing.md,
      borderRadius: radius.lg, borderColor: colors.accent, backgroundColor: colors.background,
      shadowColor: colors.accent, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 6 },
      shadowRadius: 16, elevation: 4 },
    ratingLabel: { ...typography.body, color: colors.accent, fontSize: 12, fontWeight: "700",
      letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center" },
    rating: { color: colors.accent, fontSize: 64, fontWeight: "800", marginTop: spacing.sm,
      textAlign: "center", fontVariant: ["tabular-nums"] },
    ratingMax: { ...typography.heading, fontSize: 20, fontWeight: "500", color: colors.textSecondary },
    body: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
    ratingExplanation: { ...typography.body, fontSize: 12, lineHeight: 18, marginTop: spacing.smd },
    statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
    scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.smd },
    cardTitle: { ...typography.heading, fontSize: 15, flex: 1 },
    score: { fontSize: 15, fontWeight: "700", color: colors.accent },
    assessmentText: { ...typography.body, color: colors.textPrimary, lineHeight: 22, marginTop: spacing.smd },
    listRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
    listNumber: { ...typography.body, color: colors.accent, fontWeight: "700", lineHeight: 22 },
    listText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 22 },
    chips: { flexDirection: "row", flexWrap: "wrap" },
    backButton: { marginTop: spacing.lg },
  });
}
