import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import ScreenContainer from "../ui/ScreenContainer";
import PrimaryButton from "../ui/PrimaryButton";
import Waveform from "../ui/Waveform";
import ConfirmDialog from "../ui/ConfirmDialog";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { getSessionById, getSessionErrorMessage } from "../../services/sessionService";
import {
  createRecording,
  createRecordingId,
  getRecordingErrorMessage,
} from "../../services/recordingService";
import { MAX_RECORDING_SECONDS, useRecording } from "../../hooks/useRecording";
import {
  deleteLocalRecording,
  deleteTemporaryAudio,
  persistRecording,
} from "../../storage/audioStorage";

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.min(MAX_RECORDING_SECONDS, totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function LocalRecordingScreen() {
  const params = useLocalSearchParams();
  const sessionId = firstParam(params.id);
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [screenError, setScreenError] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [showDeleteRecording, setShowDeleteRecording] = useState(false);
  const acceptInProgressRef = useRef(false);
  const cleanupInProgressRef = useRef(false);
  const pendingRecordingIdRef = useRef(null);
  const mountedRef = useRef(true);
  const orbPulse = useRef(new Animated.Value(1)).current;
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const recording = useRecording();
  const player = useAudioPlayer(recording.recordingUri, {
    updateInterval: 250,
  });
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      if (!sessionId) {
        setScreenError("This session could not be found.");
        setLoadingSession(false);
        return;
      }
      try {
        const loadedSession = await getSessionById(sessionId);
        if (cancelled) return;
        if (!loadedSession) {
          setScreenError("This session no longer exists.");
        } else {
          setSession(loadedSession);
        }
      } catch (error) {
        if (!cancelled) setScreenError(getSessionErrorMessage(error));
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (recording.phase !== "recording") {
      orbPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, {
          toValue: 1.07,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [orbPulse, recording.phase]);

  useEffect(() => {
    if (playerStatus.error) {
      if (__DEV__) console.warn("Recording playback failed", playerStatus.error);
      setPlaybackError("The recording could not be played. Please try again.");
    }
  }, [playerStatus.error]);

  const pausePlayback = () => {
    try {
      if (playerStatus.playing) player.pause();
    } catch (error) {
      if (__DEV__) console.warn("Could not pause recording playback", error);
    }
  };

  const handlePlayback = async () => {
    if (!recording.recordingUri) return;
    setPlaybackError("");
    try {
      if (playerStatus.playing) {
        player.pause();
        return;
      }
      if (
        playerStatus.didJustFinish ||
        (playerStatus.duration > 0 &&
          playerStatus.currentTime >= playerStatus.duration)
      ) {
        await player.seekTo(0);
      }
      player.play();
    } catch (error) {
      if (__DEV__) console.warn("Could not control recording playback", error);
      if (mountedRef.current) {
        setPlaybackError("The recording could not be played. Please try again.");
      }
    }
  };

  const cleanupCurrentAttempt = async () => {
    if (cleanupInProgressRef.current || acceptInProgressRef.current) return false;
    cleanupInProgressRef.current = true;
    setDiscarding(true);
    setScreenError("");
    setPlaybackError("");
    pausePlayback();
    try {
      if (pendingRecordingIdRef.current) {
        await deleteLocalRecording(pendingRecordingIdRef.current);
        pendingRecordingIdRef.current = null;
      }
      return await recording.discardRecording();
    } catch (error) {
      if (mountedRef.current) {
        setScreenError(getRecordingErrorMessage(error));
      }
      return false;
    } finally {
      cleanupInProgressRef.current = false;
      if (mountedRef.current) setDiscarding(false);
    }
  };

  const handleRecordAgain = async () => {
    await cleanupCurrentAttempt();
  };

  const handleDeleteRecording = async () => {
    const cleaned = await cleanupCurrentAttempt();
    if (mountedRef.current) {
      setShowDeleteRecording(false);
      if (cleaned) router.back();
    }
  };

  const handleUseRecording = async () => {
    if (
      acceptInProgressRef.current ||
      cleanupInProgressRef.current ||
      recording.phase !== "stopped" ||
      !recording.recordingUri ||
      recording.durationSeconds <= 0
    ) {
      return;
    }

    acceptInProgressRef.current = true;
    setAccepting(true);
    setScreenError("");
    setPlaybackError("");
    pausePlayback();
    const temporaryUri = recording.recordingUri;
    let recordingId = pendingRecordingIdRef.current;
    let locallyPersisted = false;

    try {
      if (!recordingId) {
        recordingId = createRecordingId(sessionId);
        pendingRecordingIdRef.current = recordingId;
      }

      await persistRecording(temporaryUri, recordingId);
      locallyPersisted = true;
      await createRecording(sessionId, recordingId, {
        duration: recording.durationSeconds,
      });

      recording.markAccepted();
      try {
        await deleteTemporaryAudio(temporaryUri);
      } catch (error) {
        if (__DEV__) console.warn("Could not remove accepted temporary audio", error);
      }
      if (mountedRef.current) {
        router.replace({
          pathname: "/session/[id]",
          params: { id: sessionId, localRecordingSaved: "1" },
        });
      }
    } catch (error) {
      if (locallyPersisted && recordingId) {
        try {
          await deleteLocalRecording(recordingId);
        } catch (cleanupError) {
          if (__DEV__) {
            console.warn("Could not roll back persisted recording", cleanupError);
          }
        }
      }
      if (mountedRef.current) {
        setScreenError(getRecordingErrorMessage(error));
      }
      acceptInProgressRef.current = false;
      if (mountedRef.current) setAccepting(false);
    }
  };

  if (loadingSession) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading session...</Text>
      </ScreenContainer>
    );
  }

  if (!session) {
    return (
      <ScreenContainer contentStyle={styles.centeredContent}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.accent} />
        <Text style={styles.unavailableTitle}>Session unavailable</Text>
        <Text style={styles.recordingHint}>{screenError}</Text>
        <PrimaryButton label="BACK" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const attemptNumber = (session.attemptCount ?? 0) + 1;
  const elapsedSeconds = Math.min(
    MAX_RECORDING_SECONDS,
    Math.floor(recording.durationMillis / 1000),
  );
  const targetLabel = session.targetDurationSeconds
    ? formatDuration(session.targetDurationSeconds)
    : "No target";

  if (recording.phase === "stopped") {
    const playbackDuration =
      playerStatus.duration > 0
        ? Math.round(playerStatus.duration)
        : recording.durationSeconds;
    const playbackPosition = Math.min(
      playbackDuration,
      Math.max(0, Math.floor(playerStatus.currentTime || 0)),
    );
    const progress = playbackDuration
      ? playbackPosition / playbackDuration
      : 0;

    return (
      <ScreenContainer>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            disabled={accepting || discarding}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Recording</Text>
        </View>
        <Text style={styles.attemptSubtitle}>Attempt {attemptNumber}</Text>

        <View style={styles.reviewCard}>
          <Waveform progress={progress} color={colors.accent} />
          <TouchableOpacity
            style={styles.playbackButton}
            onPress={handlePlayback}
            disabled={accepting || discarding}
            activeOpacity={0.8}
          >
            <Ionicons
              name={playerStatus.playing ? "pause" : "play"}
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <Text style={styles.reviewPosition}>
            {formatDuration(playbackPosition)} / {formatDuration(playbackDuration)}
          </Text>
        </View>

        {recording.stoppedAtLimit ? (
          <Text style={styles.infoText}>
            The 15-minute recording limit was reached automatically.
          </Text>
        ) : null}
        {recording.errorMessage || playbackError || screenError ? (
          <Text style={styles.errorText}>
            {recording.errorMessage || playbackError || screenError}
          </Text>
        ) : null}

        <PrimaryButton
          label="RECORD AGAIN"
          loadingLabel="RESETTING..."
          loading={discarding}
          disabled={accepting}
          icon="mic"
          pill
          onPress={handleRecordAgain}
        />
        <TouchableOpacity
          onPress={() => setShowDeleteRecording(true)}
          style={styles.textButton}
          disabled={accepting || discarding}
        >
          <Text style={styles.textButtonLabel}>Delete recording</Text>
        </TouchableOpacity>
        <PrimaryButton
          label="USE THIS RECORDING"
          loadingLabel="SAVING..."
          loading={accepting}
          disabled={discarding || !recording.recordingUri}
          onPress={handleUseRecording}
          style={styles.useRecordingButton}
        />

        <ConfirmDialog
          visible={showDeleteRecording}
          title="Delete this recording?"
          message="This attempt will be permanently removed from this device."
          confirmLabel={discarding ? "DELETING..." : "Delete"}
          destructive
          loading={discarding}
          onCancel={() => setShowDeleteRecording(false)}
          onConfirm={handleDeleteRecording}
        />
      </ScreenContainer>
    );
  }

  const isPaused = recording.phase === "paused";
  const isRecording = recording.phase === "recording";
  const isIdle = recording.phase === "idle";

  return (
    <ScreenContainer contentStyle={styles.centeredContent}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.backButton}
        disabled={recording.actionInProgress}
      >
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>

      <Animated.View
        style={[styles.orbGlow, { transform: [{ scale: orbPulse }] }]}
      >
        <View style={styles.orb}>
          <View style={styles.orbWave}>
            {isIdle ? (
              <Ionicons name="mic" size={48} color="#8EC5FF" />
            ) : (
              <Waveform
                progress={isPaused ? 0.4 : 1}
                color="#8EC5FF"
                trackColor="rgba(142,197,255,0.35)"
              />
            )}
          </View>
        </View>
      </Animated.View>

      <Text style={styles.recordingMeta}>
        {session.title} · Attempt {attemptNumber}
      </Text>
      <Text style={styles.targetMeta}>
        Target: {targetLabel} · Maximum: 15:00
      </Text>
      <Text style={styles.recordingHint}>
        {isIdle
          ? "Tap Record when you're ready. Your target is a guide, not a recording limit."
          : isPaused
            ? "Recording paused. Resume when you're ready."
            : "Recording in progress. Speak clearly and take your time."} {" "}
        Recording works without internet.
      </Text>

      {recording.errorMessage || screenError ? (
        <Text style={styles.errorText}>
          {recording.errorMessage || screenError}
        </Text>
      ) : null}

      <View style={styles.recordingSpacer} />

      <View style={styles.fullWaveform}>
        <Waveform
          progress={isRecording ? 1 : isPaused ? 0.4 : 0}
          color={colors.accent}
        />
      </View>

      {isIdle ? (
        <View style={styles.idleControls}>
          <Text style={styles.idleTimer}>00:00</Text>
          <PrimaryButton
            label="RECORD"
            loadingLabel="STARTING..."
            loading={recording.actionInProgress}
            icon="mic"
            pill
            onPress={recording.startRecording}
            style={styles.recordButton}
          />
        </View>
      ) : (
        <View style={styles.controlsRow}>
          <View style={styles.controlItem}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={
                isPaused ? recording.resumeRecording : recording.pauseRecording
              }
              disabled={recording.actionInProgress}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isPaused ? "play" : "pause"}
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>
              {isPaused ? "Resume" : "Pause"}
            </Text>
          </View>

          <View style={styles.controlItem}>
            <View style={styles.micButton}>
              <Ionicons name="mic" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.controlLabel}>
              {formatDuration(elapsedSeconds)}
            </Text>
          </View>

          <View style={styles.controlItem}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => recording.stopRecording()}
              disabled={recording.actionInProgress}
              activeOpacity={0.8}
            >
              <Ionicons name="stop" size={20} color="#E5484D" />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>Stop</Text>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    centeredContent: {
      flexGrow: 1,
      alignItems: "center",
    },
    loadingText: {
      ...typography.body,
      marginTop: spacing.sm,
    },
    unavailableTitle: {
      ...typography.heading,
      marginTop: spacing.md,
    },
    backButton: {
      alignSelf: "flex-start",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerTitle: {
      ...typography.heading,
      fontSize: 18,
      marginLeft: spacing.sm,
    },
    attemptSubtitle: {
      ...typography.body,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      textAlign: "center",
    },
    orbGlow: {
      width: 236,
      height: 236,
      borderRadius: 118,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(46,107,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(46,107,255,0.18)",
      marginTop: spacing.xl,
    },
    orb: {
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: "#0B1445",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#2E6BFF",
      shadowOpacity: 0.55,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 24,
      elevation: 8,
    },
    orbWave: {
      width: 130,
      alignItems: "center",
    },
    recordingMeta: {
      ...typography.body,
      textAlign: "center",
      marginTop: spacing.lg,
    },
    targetMeta: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.navySoft,
      textAlign: "center",
      marginTop: spacing.xs,
    },
    recordingHint: {
      ...typography.body,
      textAlign: "center",
      lineHeight: 20,
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    errorText: {
      color: "#D92D20",
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      marginTop: spacing.md,
    },
    infoText: {
      color: colors.navySoft,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      marginBottom: spacing.sm,
    },
    recordingSpacer: {
      flexGrow: 1,
      minHeight: spacing.xl,
    },
    fullWaveform: {
      alignSelf: "stretch",
      marginBottom: spacing.lg,
    },
    recordButton: {
      alignSelf: "stretch",
      marginBottom: spacing.md,
    },
    idleControls: {
      alignSelf: "stretch",
    },
    idleTimer: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center",
    },
    controlsRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-evenly",
      alignSelf: "stretch",
      marginBottom: spacing.md,
    },
    controlItem: {
      alignItems: "center",
      gap: spacing.sm,
    },
    controlButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#101828",
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 2,
    },
    micButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#2E6BFF",
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
      elevation: 4,
    },
    controlLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
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
    playbackButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginTop: spacing.md,
    },
    reviewPosition: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      textAlign: "center",
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
    useRecordingButton: {
      marginTop: spacing.sm,
    },
  });
}
