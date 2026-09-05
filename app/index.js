import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import SplashScreen from '../components/screens/SplashScreen';

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return <SplashScreen />;
  }

  return <Redirect href="/sign-in" />;
}
