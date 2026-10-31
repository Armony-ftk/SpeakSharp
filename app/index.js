import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const { currentUser, isEmailVerified } = useAuth();

  if (!currentUser) {
    return <Redirect href="/sign-in" />;
  }

  if (!isEmailVerified) {
    return <Redirect href="/verify-email" />;
  }

  return <Redirect href="/home" />;
}
