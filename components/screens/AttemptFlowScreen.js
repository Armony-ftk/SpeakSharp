import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenContainer from "../ui/ScreenContainer";
import PrimaryButton from "../ui/PrimaryButton";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { RECORDING_STATUS } from "../../constants/recordindStatuses";
import {
  getRecording, markRecordingUploaded, subscribeToRecording, getTranscriptionErrorMessage,
} from "../../services/recordingService";
import { getUploadErrorMessage, uploadRecordingAudio } from "../../services/audioUploadService";

const PROCESSING_STEPS = [
  "Recording uploaded", "Transcript generated",
  "Speaking metrics unavailable", "AI feedback unavailable",
];

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AttemptFlowScreen() {
  const params = useLocalSearchParams();
  const sessionId = firstParam(params.id);
  const recordingId = firstParam(params.recordingId);
  // A new recording gets new state; an earlier upload cannot update the next attempt's UI.
  return <RecordingProcessing key={`${sessionId}/${recordingId}`} sessionId={sessionId} recordingId={recordingId} />;
}

function RecordingProcessing({ sessionId, recordingId }) {
  const [recording, setRecording] = useState(null);
  const [uploadState, setUploadState] = useState("pending");
  const [uploadError, setUploadError] = useState("");
  const [listenerError, setListenerError] = useState("");
  const [listenerVersion, setListenerVersion] = useState(0);
  const mountedRef = useRef(true);
  const uploadInProgressRef = useRef(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!sessionId || !recordingId) {
      setListenerError("Select a saved recording from your session to view its progress.");
      return;
    }
    setListenerError("");
    try {
      return subscribeToRecording(sessionId, recordingId, (value) => {
        setRecording(value);
        setListenerError(value ? "" : "This recording is unavailable or has been deleted.");
        if (value?.uploadedAt && !uploadInProgressRef.current) setUploadState("done");
      }, () => setListenerError("Could not load processing updates. Check your connection and reconnect."));
    } catch {
      setListenerError("Could not load this recording. Please sign in and reopen the session.");
    }
  }, [sessionId, recordingId, listenerVersion]);

  const startUpload = useCallback(async (retryProcessing = false) => {
    if (uploadInProgressRef.current || !sessionId || !recordingId) return;
    uploadInProgressRef.current = true;
    if (mountedRef.current) {
      setUploadState("uploading");
      setUploadError("");
    }
    try {
      const current = await getRecording(sessionId, recordingId);
      if (!current) throw new Error("The recording no longer exists.");
      const eligible = [RECORDING_STATUS.PENDING_UPLOAD, RECORDING_STATUS.FAILED].includes(current.processingStatus);
      if (!eligible || (current.uploadedAt && !retryProcessing)) {
        if (mountedRef.current) setUploadState("done");
        return;
      }
      const audioPath = await uploadRecordingAudio(sessionId, recordingId);
      await markRecordingUploaded(sessionId, recordingId, audioPath);
      if (mountedRef.current) setUploadState("done");
    } catch (error) {
      if (mountedRef.current) {
        setUploadState("error");
        setUploadError(getUploadErrorMessage(error));
      }
    } finally {
      uploadInProgressRef.current = false;
    }
  }, [sessionId, recordingId]);

  useEffect(() => { void startUpload(); }, [startUpload]);

  const status = recording?.processingStatus;
  const transcriptReady = [RECORDING_STATUS.TRANSCRIPT_READY, RECORDING_STATUS.ANALYSING, RECORDING_STATUS.COMPLETED].includes(status)
    && Boolean(recording?.transcript?.originalText?.trim());
  const failed = status === RECORDING_STATUS.FAILED;
  const waiting = status === RECORDING_STATUS.PENDING_UPLOAD && uploadState === "done";
  const canRetryProcessing = failed || waiting;
  const goBack = () => router.replace({ pathname: "/session/[id]", params: { id: sessionId } });

  return (
    <ScreenContainer contentStyle={styles.centeredContent}>
      <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.processingTitle}>
        {transcriptReady ? "Transcription complete" : "Processing your recording"}
      </Text>
      {PROCESSING_STEPS.map((step, index) => {
        const done = index === 0 ? uploadState === "done" : index === 1 && transcriptReady;
        const active = !listenerError && (index === 0
          ? uploadState === "pending" || uploadState === "uploading"
          : index === 1 && status === RECORDING_STATUS.TRANSCRIBING);
        const stepFailed = index === 0 ? uploadState === "error" : index === 1 && failed;
        let label = step;
        if (index === 0 && active) label = "Uploading recording";
        if (index === 0 && stepFailed) label = "Recording upload failed";
        if (index === 1 && active) label = "Generating transcription";
        if (index === 1 && waiting) label = "Waiting for transcription";
        if (index === 1 && stepFailed) label = "Transcription failed";
        return (
          <View key={step} style={styles.processingRow}>
            {done ? <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              : active ? <ActivityIndicator size="small" color={colors.accent} />
                : stepFailed ? <Ionicons name="warning-outline" size={20} color="#D92D20" />
                  : <Ionicons name="ellipse-outline" size={20} color={colors.border} />}
            <Text style={[styles.processingLabel, !done && !active && styles.processingLabelPending,
              stepFailed && styles.processingLabelError]}>{label}</Text>
          </View>
        );
      })}
      {listenerError ? (
        <>
          <Text style={styles.uploadErrorText}>{listenerError}</Text>
          {recordingId ? <PrimaryButton label="RECONNECT" onPress={() => setListenerVersion((value) => value + 1)} style={styles.retryButton} /> : null}
        </>
      ) : null}
      {uploadState === "error" ? (
        <>
          <Text style={styles.uploadErrorText}>{uploadError}</Text>
          <PrimaryButton label="RETRY UPLOAD" onPress={() => startUpload(canRetryProcessing)} style={styles.retryButton} />
        </>
      ) : failed ? (
        <Text style={styles.uploadErrorText}>{getTranscriptionErrorMessage(recording.processingError?.code)}</Text>
      ) : (
        <Text style={styles.processingHint}>
          {transcriptReady ? "Your transcript is saved. Speaking metrics and AI feedback are not available yet."
            : waiting ? "Your upload is complete. Waiting for the transcription service. You can leave this screen and return later."
              : "This may take a moment. Your saved recording will be kept."}
        </Text>
      )}
      {canRetryProcessing && uploadState === "done" && !listenerError ? (
        <PrimaryButton label={failed ? "RETRY TRANSCRIPTION" : "RETRY PROCESSING"}
          onPress={() => startUpload(true)} style={styles.retryButton} />
      ) : null}
      {transcriptReady ? (
        <View style={styles.transcriptCard}>
          <Text style={styles.transcriptHeading}>Transcript</Text>
          <Text selectable style={styles.transcriptText}>{recording.transcript.originalText}</Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={goBack} style={styles.backToSessionLink}>
        <Text style={styles.backToSessionText}>Back to Session</Text>
      </TouchableOpacity>
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    centeredContent: { flexGrow: 1, alignItems: "center" },
    backButton: { alignSelf: "flex-start", marginBottom: spacing.lg },
    processingTitle: { ...typography.heading, fontSize: 18, marginBottom: spacing.xl, textAlign: "center" },
    processingRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginBottom: spacing.md },
    processingLabel: { fontSize: 14, fontWeight: "600", color: colors.navy, marginLeft: spacing.sm },
    processingLabelPending: { color: colors.textSecondary, fontWeight: "500" },
    processingLabelError: { color: "#D92D20", fontWeight: "600" },
    processingHint: { ...typography.body, marginTop: spacing.md },
    uploadErrorText: { ...typography.body, color: "#D92D20", lineHeight: 20, marginTop: spacing.md, textAlign: "center" },
    retryButton: { alignSelf: "stretch", marginTop: spacing.md },
    transcriptCard: { alignSelf: "stretch", backgroundColor: colors.inputBackground, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg },
    transcriptHeading: { ...typography.heading, fontSize: 18, marginBottom: spacing.sm },
    transcriptText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
    backToSessionLink: { alignItems: "center", marginTop: spacing.lg },
    backToSessionText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  });
}
