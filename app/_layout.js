import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import OfflineIndicator from '../components/ui/OfflineIndicator';
import SplashScreen from '../components/screens/SplashScreen';
import { ThemeProvider, useAppTheme } from '../constants/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';

function RootLayoutNav() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, initializing, isEmailVerified } = useAuth();

  if (initializing) {
    return <SplashScreen />;
  }

  const isSignedOut = !currentUser;
  const needsVerification = Boolean(currentUser) && !isEmailVerified;
  const hasAppAccess = Boolean(currentUser) && isEmailVerified;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />

          <Stack.Protected guard={isSignedOut}>
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="forgot-password" />
          </Stack.Protected>

          <Stack.Protected guard={needsVerification}>
            <Stack.Screen name="verify-email" />
          </Stack.Protected>

          <Stack.Protected guard={hasAppAccess}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="edit-profile" />
            <Stack.Screen name="change-password" />
            <Stack.Screen name="create-session" />
            <Stack.Screen name="session/[id]" />
            <Stack.Screen name="session/[id]/attempt" />
          </Stack.Protected>
        </Stack>
        <OfflineIndicator />
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
