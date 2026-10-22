import { useLocalSearchParams } from "expo-router";
import AttemptFlowScreen from "../../../components/screens/AttemptFlowScreen";
import LocalRecordingScreen from "../../../components/screens/LocalRecordingScreen";

export default function AttemptRoute() {
  const { view } = useLocalSearchParams();
  const selectedView = Array.isArray(view) ? view[0] : view;

  return selectedView === "feedback" || selectedView === "processing" ? (
    <AttemptFlowScreen />
  ) : (
    <LocalRecordingScreen />
  );
}
