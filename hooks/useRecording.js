import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  AudioQuality,
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { deleteTemporaryAudio } from "../storage/audioStorage";
import { MAX_RECORDING_SECONDS } from "../constants/recording";

export { MAX_RECORDING_SECONDS } from "../constants/recording";
const MAX_RECORDING_MILLIS = MAX_RECORDING_SECONDS * 1000;

const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache",
  numberOfChannels: 1,
  bitRate: 64000,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    audioQuality: AudioQuality.MEDIUM,
  },
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    bitsPerSecond: 64000,
  },
};

function logRecordingError(message, error) {
  if (__DEV__) {
    console.warn(message, error);
  }
}

export function useRecording() {
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [phase, setPhase] = useState("idle");
  const [recordingUri, setRecordingUri] = useState(null);
  const [finalDurationMillis, setFinalDurationMillis] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [stoppedAtLimit, setStoppedAtLimit] = useState(false);

  const mountedRef = useRef(true);
  const phaseRef = useRef("idle");
  const recordingUriRef = useRef(null);
  const recorderDurationRef = useRef(0);
  const actionInProgressRef = useRef(false);
  const hardStopTimeoutRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const acceptedRef = useRef(false);
  const unmountCleanupStartedRef = useRef(false);

  const updateErrorMessage = useCallback((message) => {
    if (mountedRef.current) setErrorMessage(message);
  }, []);

  const updatePhase = useCallback((nextPhase) => {
    phaseRef.current = nextPhase;
    if (mountedRef.current) setPhase(nextPhase);
  }, []);

  const updateRecordingUri = useCallback((uri) => {
    recordingUriRef.current = uri;
    if (mountedRef.current) setRecordingUri(uri);
  }, []);

  const clearHardStop = useCallback(() => {
    if (hardStopTimeoutRef.current) {
      clearTimeout(hardStopTimeoutRef.current);
      hardStopTimeoutRef.current = null;
    }
  }, []);

  const scheduleHardStop = useCallback(
    (durationMillis) => {
      clearHardStop();
      const remainingMillis = Math.max(
        0,
        MAX_RECORDING_MILLIS - durationMillis,
      );
      hardStopTimeoutRef.current = setTimeout(() => {
        hardStopTimeoutRef.current = null;
        stopRecordingRef.current?.({ automatic: true });
      }, remainingMillis);
    },
    [clearHardStop],
  );

  const runGuardedAction = useCallback(async (action) => {
    if (actionInProgressRef.current) return false;
    actionInProgressRef.current = true;
    if (mountedRef.current) setActionInProgress(true);
    try {
      return await action();
    } finally {
      actionInProgressRef.current = false;
      if (mountedRef.current) setActionInProgress(false);
    }
  }, []);

  const resetState = useCallback(() => {
    clearHardStop();
    recorderDurationRef.current = 0;
    acceptedRef.current = false;
    updateRecordingUri(null);
    updatePhase("idle");
    if (mountedRef.current) {
      setFinalDurationMillis(0);
      setStoppedAtLimit(false);
    }
  }, [clearHardStop, updatePhase, updateRecordingUri]);

  const startRecording = useCallback(
    () =>
      runGuardedAction(async () => {
        if (phaseRef.current !== "idle") return false;
        if (Platform.OS === "web") {
          updateErrorMessage(
            "Audio recording is available in the SpeakSharp mobile app.",
          );
          return false;
        }

        updateErrorMessage("");
        setStoppedAtLimit(false);

        try {
          let permission = await getRecordingPermissionsAsync();
          if (!permission.granted) {
            permission = await requestRecordingPermissionsAsync();
          }
          if (!permission.granted) {
            updateErrorMessage(
              "Microphone access is required to record your presentation.",
            );
            return false;
          }
          if (!mountedRef.current) return false;

          await setAudioModeAsync({
            allowsRecording: true,
            allowsBackgroundRecording: false,
            playsInSilentMode: true,
          });
          if (!mountedRef.current) {
            await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
            return false;
          }
          await audioRecorder.prepareToRecordAsync();
          if (!mountedRef.current) {
            const abandonedUri = recordingUriRef.current;
            if (abandonedUri) {
              await deleteTemporaryAudio(abandonedUri).catch(() => {});
            }
            await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
            return false;
          }
          audioRecorder.record();
          const status = audioRecorder.getStatus();
          recorderDurationRef.current = status.durationMillis;
          recordingUriRef.current = status.url ?? audioRecorder.uri ?? null;
          if (mountedRef.current) setRecordingUri(null);
          updatePhase("recording");
          scheduleHardStop(status.durationMillis);
          return true;
        } catch (error) {
          clearHardStop();
          logRecordingError("Could not start audio recording", error);
          let failedRecordingUri = recordingUriRef.current;
          if (mountedRef.current) {
            try {
              const status = audioRecorder.getStatus();
              if (status.canRecord) {
                await audioRecorder.stop();
                if (mountedRef.current) {
                  const stoppedStatus = audioRecorder.getStatus();
                  failedRecordingUri =
                    stoppedStatus.url ?? audioRecorder.uri ?? failedRecordingUri;
                  recordingUriRef.current = failedRecordingUri;
                }
              }
            } catch (cleanupError) {
              logRecordingError("Could not release failed recorder", cleanupError);
            }
          }
          if (failedRecordingUri) {
            await deleteTemporaryAudio(failedRecordingUri).catch((cleanupError) => {
              logRecordingError(
                "Could not remove failed temporary recording",
                cleanupError,
              );
            });
          }
          await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
          updateErrorMessage(
            "Recording could not start. Please check microphone access and try again.",
          );
          resetState();
          return false;
        }
      }),
    [
      audioRecorder,
      clearHardStop,
      resetState,
      runGuardedAction,
      scheduleHardStop,
      updateErrorMessage,
      updatePhase,
    ],
  );

  const pauseRecording = useCallback(
    () =>
      runGuardedAction(async () => {
        if (phaseRef.current !== "recording") return false;
        updateErrorMessage("");
        try {
          clearHardStop();
          audioRecorder.pause();
          const status = audioRecorder.getStatus();
          recorderDurationRef.current = status.durationMillis;
          updatePhase("paused");
          return true;
        } catch (error) {
          logRecordingError("Could not pause audio recording", error);
          updateErrorMessage("Recording could not be paused. Please try again.");
          scheduleHardStop(recorderDurationRef.current);
          return false;
        }
      }),
    [
      audioRecorder,
      clearHardStop,
      runGuardedAction,
      scheduleHardStop,
      updateErrorMessage,
      updatePhase,
    ],
  );

  const resumeRecording = useCallback(
    () =>
      runGuardedAction(async () => {
        if (phaseRef.current !== "paused") return false;
        updateErrorMessage("");
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            allowsBackgroundRecording: false,
            playsInSilentMode: true,
          });
          if (!mountedRef.current) return false;
          audioRecorder.record();
          const status = audioRecorder.getStatus();
          recorderDurationRef.current = status.durationMillis;
          updatePhase("recording");
          scheduleHardStop(status.durationMillis);
          return true;
        } catch (error) {
          logRecordingError("Could not resume audio recording", error);
          updateErrorMessage("Recording could not resume. Please try again.");
          return false;
        }
      }),
    [
      audioRecorder,
      runGuardedAction,
      scheduleHardStop,
      updateErrorMessage,
      updatePhase,
    ],
  );

  const stopRecording = useCallback(
    ({ automatic = false } = {}) =>
      runGuardedAction(async () => {
        if (!new Set(["recording", "paused"]).has(phaseRef.current)) {
          return false;
        }

        updateErrorMessage("");
        clearHardStop();
        try {
          await audioRecorder.stop();
          if (!mountedRef.current) return false;
          const status = audioRecorder.getStatus();
          const uri = status.url ?? audioRecorder.uri;
          recordingUriRef.current = uri ?? recordingUriRef.current;
          const durationMillis = Math.min(
            MAX_RECORDING_MILLIS,
            Math.max(status.durationMillis, recorderDurationRef.current),
          );

          if (!uri || durationMillis <= 0) {
            throw new Error("The recorder did not produce a valid audio file.");
          }

          recorderDurationRef.current = durationMillis;
          updateRecordingUri(uri);
          if (mountedRef.current) {
            setFinalDurationMillis(durationMillis);
            setStoppedAtLimit(
              automatic || durationMillis >= MAX_RECORDING_MILLIS,
            );
          }
          updatePhase("stopped");
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          }).catch((error) => {
            logRecordingError("Could not reset audio mode after recording", error);
          });
          return true;
        } catch (error) {
          logRecordingError("Could not stop audio recording", error);
          if (mountedRef.current) {
            try {
              const status = audioRecorder.getStatus();
              if (status.isRecording) {
                scheduleHardStop(status.durationMillis);
              }
            } catch (statusError) {
              logRecordingError(
                "Could not read recorder status after stop failure",
                statusError,
              );
            }
          }
          updateErrorMessage(
            "Recording could not be stopped safely. Please try again.",
          );
          return false;
        }
      }),
    [
      audioRecorder,
      clearHardStop,
      runGuardedAction,
      scheduleHardStop,
      updateErrorMessage,
      updatePhase,
      updateRecordingUri,
    ],
  );

  stopRecordingRef.current = stopRecording;

  const discardRecording = useCallback(
    ({ deleteFile = true } = {}) =>
      runGuardedAction(async () => {
        updateErrorMessage("");
        clearHardStop();
        let uri = recordingUriRef.current;

        try {
          if (phaseRef.current === "recording" || phaseRef.current === "paused") {
            await audioRecorder.stop();
            if (mountedRef.current) {
              const status = audioRecorder.getStatus();
              uri = status.url ?? audioRecorder.uri ?? uri;
              recordingUriRef.current = uri;
            }
          }
          await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
          if (deleteFile && uri) {
            await deleteTemporaryAudio(uri);
          }
          resetState();
          return true;
        } catch (error) {
          logRecordingError("Could not discard audio recording", error);
          resetState();
          updateErrorMessage(
            "The recording was reset, but its temporary file could not be removed.",
          );
          return false;
        }
      }),
    [
      audioRecorder,
      clearHardStop,
      resetState,
      runGuardedAction,
      updateErrorMessage,
    ],
  );

  const markAccepted = useCallback(() => {
    acceptedRef.current = true;
    clearHardStop();
    updateRecordingUri(null);
  }, [clearHardStop, updateRecordingUri]);

  useEffect(() => {
    recorderDurationRef.current = recorderState.durationMillis;
    if (
      (phase === "recording" || phase === "paused") &&
      recorderState.durationMillis >= MAX_RECORDING_MILLIS
    ) {
      stopRecordingRef.current?.({ automatic: true });
    }
  }, [phase, recorderState.durationMillis]);

  useEffect(() => {
    return () => {
      if (unmountCleanupStartedRef.current) return;
      unmountCleanupStartedRef.current = true;
      mountedRef.current = false;
      clearHardStop();
      const temporaryUri = recordingUriRef.current;
      const recordingWasAccepted = acceptedRef.current;

      const cleanup = async () => {
        try {
          await setAudioModeAsync({ allowsRecording: false });
        } catch (error) {
          logRecordingError("Could not reset audio mode during cleanup", error);
        }

        if (!recordingWasAccepted && temporaryUri) {
          try {
            await deleteTemporaryAudio(temporaryUri);
          } catch (error) {
            logRecordingError("Could not remove temporary recording", error);
          }
        }
      };

      // useAudioRecorder owns and releases its native shared object on unmount.
      // Only cached JavaScript values are safe to use from this later cleanup.
      void cleanup().catch((error) => {
        logRecordingError("Could not finish recording cleanup", error);
      });
    };
  }, [clearHardStop]);

  const displayedDurationMillis =
    phase === "stopped"
      ? finalDurationMillis
      : Math.min(recorderState.durationMillis, MAX_RECORDING_MILLIS);

  return {
    phase,
    recordingUri,
    durationMillis: displayedDurationMillis,
    durationSeconds: Math.min(
      MAX_RECORDING_SECONDS,
      Math.max(0, Math.round(displayedDurationMillis / 1000)),
    ),
    errorMessage,
    actionInProgress,
    stoppedAtLimit,
    clearError: () => updateErrorMessage(""),
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    markAccepted,
  };
}
