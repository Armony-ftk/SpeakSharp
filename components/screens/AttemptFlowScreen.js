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
  subscribeToRecording, getTranscriptionErrorMessage,
} from "../../services/recordingService";
import { useAccountData } from "../../context/AccountDataContext";
import { retryQueuedUpload } from "../../services/recordingSyncService";
import { getMetricsProgress, hasSavedTranscript } from "../../utils/metricsProgress";
import { getAnalysisProgress, getAnalysisErrorMessage, getAnalysisRetryErrorMessage } from "../../utils/analysisProgress";
import { requestAnalysisRetry } from "../../services/processingService";
import { getSessionById } from "../../services/sessionService";
import { hasRecordingFeedback } from "../../utils/recordingFeedback";
import RecordingFeedbackView from "./RecordingFeedbackView";

const PROCESSING_STEPS = [
  "Recording uploaded", "Transcript generated",
  "Speaking metrics calculated", "AI feedback generated",
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
  const account = useAccountData();
  const [remoteRecording, setRecording] = useState(null);
  const shared = account.recordingEntries.find((entry) => entry.data.id === sessionId);
  const recording = remoteRecording ?? shared?.recordings.find((entry) => entry.id === recordingId) ?? null;
  const localEntry = account.pendingRecordings.find((entry) => entry.recordingId === recordingId && entry.sessionId === sessionId);
  const [session, setSession] = useState(null);
  const [requestState, setUploadState] = useState("queued");
  const hasRemoteUpload = Boolean(recording?.uploadedAt || hasSavedTranscript(recording)
    || ["transcribing", "transcript_ready", "analysing", "completed"].includes(recording?.processingStatus));
  const uploadState = hasRemoteUpload && !localEntry?.retryProcessing ? "done"
    : localEntry?.syncStatus === "synced" ? "done"
      : localEntry?.syncStatus === "error" ? "error"
        : localEntry?.syncStatus === "uploading" && account.networkOnline ? "uploading"
          : localEntry ? "queued" : requestState;
  const [uploadError, setUploadError] = useState("");
  const [listenerError, setListenerError] = useState("");
  const [listenerVersion, setListenerVersion] = useState(0);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [analysisRetryError, setAnalysisRetryError] = useState("");
  const mountedRef = useRef(true);
  const uploadInProgressRef = useRef(false);
  const analysisRetryRef = useRef(false);
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getSessionById(sessionId).then((value) => {
      if (active) setSession(value);
    }).catch(() => {
      // Title and target are optional; recording feedback remains available.
      if (active) setSession(null);
    });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !recordingId) {
      setListenerError("Select a saved recording from your session to view its progress.");
      return;
    }
    setListenerError("");
    try {
      return subscribeToRecording(sessionId, recordingId, (value) => {
        setRecording(value);
        setListenerError(value || localEntry ? "" : "This recording is unavailable or has been deleted.");
        if (value?.uploadedAt && !uploadInProgressRef.current) setUploadState("done");
      }, () => setListenerError(localEntry ? "" : "Could not load processing updates. Check your connection and reconnect."));
    } catch {
      setListenerError("Could not load this recording. Please sign in and reopen the session.");
    }
  }, [sessionId, recordingId, listenerVersion, Boolean(localEntry)]);

  const startUpload = useCallback(async (retryProcessing = false) => {
    if (uploadInProgressRef.current || !sessionId || !recordingId) return;
    uploadInProgressRef.current = true;
    if (mountedRef.current) {
      setUploadError("");
    }
    try {
      await retryQueuedUpload(sessionId, recordingId, retryProcessing);
    } catch (error) {
      if (mountedRef.current) {
        setUploadState("error");
        setUploadError(error?.message ?? "Upload failed. Your saved audio has been retained.");
      }
    } finally {
      uploadInProgressRef.current = false;
    }
  }, [sessionId, recordingId]);

  // Legacy saved attempts join the same queue. New local-first saves are already
  // owned by the coordinator; opening this screen never starts another upload.
  useEffect(() => {
    if (!localEntry && !hasRemoteUpload && recording?.processingStatus === RECORDING_STATUS.PENDING_UPLOAD) void startUpload();
  }, [startUpload, Boolean(localEntry), hasRemoteUpload, recording?.processingStatus]);

  const retryAnalysis = async () => {
    if (analysisRetryRef.current) return;
    analysisRetryRef.current = true;
    setRetryingAnalysis(true);
    setAnalysisRetryError("");
    try {
      await requestAnalysisRetry(sessionId, recordingId);
    } catch (error) {
      if (mountedRef.current) setAnalysisRetryError(getAnalysisRetryErrorMessage(error?.code));
    } finally {
      analysisRetryRef.current = false;
      if (mountedRef.current) setRetryingAnalysis(false);
    }
  };

  const status = recording?.processingStatus;
  const metricsProgress = getMetricsProgress(recording);
  const analysisProgress = getAnalysisProgress(recording);
  const transcriptReady = hasSavedTranscript(recording)
    && ([RECORDING_STATUS.TRANSCRIPT_READY, RECORDING_STATUS.ANALYSING, RECORDING_STATUS.COMPLETED].includes(status)
      || metricsProgress.failed || analysisProgress.failed);
  const failed = status === RECORDING_STATUS.FAILED;
  // A listener snapshot can confirm upload before the local upload promise settles.
  const uploadDone = uploadState === "done" || (uploadState !== "error"
    && ((Boolean(recording?.uploadedAt) && uploadState !== "uploading")
      || [RECORDING_STATUS.TRANSCRIBING, RECORDING_STATUS.TRANSCRIPT_READY,
        RECORDING_STATUS.ANALYSING, RECORDING_STATUS.COMPLETED].includes(status)));
  const waiting = status === RECORDING_STATUS.PENDING_UPLOAD && uploadState === "done";
  const canRetryProcessing = (failed || waiting) && !hasSavedTranscript(recording) && !metricsProgress.failed;
  // Match the existing callable's six-minute stall condition for presentation only.
  // Re-evaluate on render/re-entry; do not add a timer or change retry operations.
  const analysisWaiting = metricsProgress.ready && status === RECORDING_STATUS.TRANSCRIPT_READY;
  const analysisSince = (analysisProgress.active ? recording?.analysisJob?.startedAt
    : analysisWaiting ? recording?.updatedAt : null)?.toMillis?.();
  const analysisStalled = Number.isFinite(analysisSince) && Date.now() - analysisSince > 6 * 60 * 1000;
  const showAnalysisRetry = analysisProgress.failed || analysisStalled || retryingAnalysis || Boolean(analysisRetryError);
  const visibleListenerError = localEntry && !remoteRecording ? "" : listenerError;
  const goBack = () => router.replace({ pathname: "/session/[id]", params: { id: sessionId } });

  if (!recording && !visibleListenerError) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.processingHint}>Loading recording...</Text>
        <PrimaryButton label="Back to Session" onPress={goBack} style={styles.retryButton} />
      </ScreenContainer>
    );
  }

  if (localEntry?.deletionPending) {
    return <ScreenContainer contentStyle={styles.centeredContent}>
      <Text style={styles.processingTitle}>Deletion unfinished</Text>
      <Text style={styles.processingHint}>Return to the session and retry Delete. Your audio has been retained until deletion is confirmed.</Text>
      <PrimaryButton label="Back to Session" onPress={goBack} />
    </ScreenContainer>;
  }

  if (status === RECORDING_STATUS.COMPLETED && !visibleListenerError) {
    if (hasRecordingFeedback(recording)) {
      return <RecordingFeedbackView recording={recording} session={session} onBackToSession={goBack} />;
    }
    return (
      <ScreenContainer>
        <Text style={styles.processingTitle}>Feedback unavailable</Text>
        <Text style={styles.processingHint}>
          This recording is complete, but its feedback is missing or incomplete. Reconnect to check for saved updates.
        </Text>
        <PrimaryButton label="RECONNECT" onPress={() => setListenerVersion((value) => value + 1)} />
        <PrimaryButton label="Back to Session" onPress={goBack} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.centeredContent}>
      <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.processingTitle}>
        {analysisProgress.ready ? "Analysis complete" : failed ? "Processing failed"
          : analysisProgress.active ? "Generating AI feedback" : metricsProgress.ready ? "Speaking metrics complete"
            : transcriptReady ? "Transcription complete"
              : uploadState === "queued" ? "Waiting for upload/transcription" : "Processing your recording"}
      </Text>
      {PROCESSING_STEPS.map((step, index) => {
        const done = index === 0 ? uploadDone : index === 1 ? transcriptReady
          : index === 2 ? metricsProgress.ready : analysisProgress.ready;
        const active = !done && !visibleListenerError && (index === 0
          ? uploadState === "uploading"
          : index === 1 ? status === RECORDING_STATUS.TRANSCRIBING
            : index === 2 ? metricsProgress.active : analysisProgress.active);
        const stepFailed = index === 0 ? uploadState === "error"
          : index === 1 ? failed && !metricsProgress.failed && !analysisProgress.failed
            : index === 2 ? metricsProgress.failed : analysisProgress.failed;
        let label = step;
        if (index === 0 && !done && uploadState === "queued") label = "Waiting for upload/transcription";
        if (index === 0 && active) label = "Uploading recording";
        if (index === 0 && stepFailed) label = "Recording upload failed";
        if (index === 1 && active) label = "Generating transcription";
        if (index === 1 && waiting) label = "Waiting for transcription";
        if (index === 1 && stepFailed) label = "Transcription failed";
        if (index === 2 && !done) label = "Waiting for speaking metrics";
        if (index === 2 && active) label = "Calculating metrics";
        if (index === 2 && stepFailed) label = "Speaking metrics failed";
        if (index === 3 && !done) label = "Waiting for AI feedback";
        if (index === 3 && active) label = "Generating AI feedback";
        if (index === 3 && stepFailed) label = "AI analysis failed";
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
      {visibleListenerError ? (
        <>
          <Text style={styles.uploadErrorText}>{visibleListenerError}</Text>
          {recordingId ? <PrimaryButton label="RECONNECT" onPress={() => setListenerVersion((value) => value + 1)} style={styles.retryButton} /> : null}
        </>
      ) : null}
      {uploadState === "error" ? (
        <>
          <Text style={styles.uploadErrorText}>{localEntry?.errorMessage || uploadError}</Text>
          <PrimaryButton label="RETRY UPLOAD" onPress={() => startUpload(canRetryProcessing)} style={styles.retryButton} />
        </>
      ) : failed ? (
        <Text style={styles.uploadErrorText}>{metricsProgress.failed
          ? "Speaking metrics could not be saved. Your transcript and audio are safe. Please contact the project administrator."
          : analysisProgress.failed ? getAnalysisErrorMessage(recording.processingError?.code)
            : getTranscriptionErrorMessage(recording.processingError?.code)}</Text>
      ) : (
        <Text style={styles.processingHint}>
          {analysisProgress.ready ? "Your transcript, speaking metrics and AI feedback are saved."
            : analysisProgress.active ? "Your AI feedback is being generated. You can leave this screen and return later. If this step stays active for more than six minutes, reopen this recording to retry AI analysis."
              : metricsProgress.ready ? "Your transcript and speaking metrics are saved. Waiting for AI analysis to start. If this takes more than six minutes, reopen this recording to retry AI analysis."
            : transcriptReady ? "Your transcript is saved. Speaking metrics are being calculated."
            : waiting ? "Your upload is complete. Waiting for the transcription service. You can leave this screen and return later."
              : "This may take a moment. Your saved recording will be kept."}
        </Text>
      )}
      {failed && canRetryProcessing && uploadState === "done" && !visibleListenerError ? (
        <PrimaryButton label="RETRY TRANSCRIPTION"
          onPress={() => startUpload(true)} style={styles.retryButton} />
      ) : null}
      {showAnalysisRetry && !visibleListenerError ? (
        <>
          {analysisRetryError ? <Text style={styles.uploadErrorText}>{analysisRetryError}</Text> : null}
          <PrimaryButton label="RETRY AI ANALYSIS" onPress={retryAnalysis}
            loading={retryingAnalysis} loadingLabel="REQUESTING RETRY" style={styles.retryButton} />
        </>
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
