import { Redirect } from 'expo-router';
import SplashScreen from '../components/screens/SplashScreen';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const {
    currentUser,
    isEmailVerified,
    role,
    roleLoading,
  } = useAuth();

  if (!currentUser) {
    return <Redirect href="/sign-in" />;
  }

  if (!isEmailVerified) {
    return <Redirect href="/verify-email" />;
  }

  if (roleLoading) {
    return <SplashScreen />;
  }

  if (role === 'admin') {
    return <Redirect href="/admin" />;
  }

  return <Redirect href="/home" />;
}
