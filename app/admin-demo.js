import { router, Redirect } from "expo-router";
import { View } from "react-native";
import PrimaryButton from "../components/ui/PrimaryButton";
import ScreenContainer from "../components/ui/ScreenContainer";

export default function AdminDemoEntry() {
  if (!__DEV__) {
    return <Redirect href="/home" />;
  }

  return (
    <ScreenContainer>
      <View>
        <PrimaryButton
          label="Open Admin Demo"
          onPress={() => router.replace("/admin")}
        />
      </View>
    </ScreenContainer>
  );
}
