import { useCallback, useEffect, useState } from "react";
import { MOCK_ADMIN_ACCESS } from "../constants/mockAdminAccess";

const ACCESS_CHECK_DELAY_MS = 250;

export function useAdminAccess() {
  const [status, setStatus] = useState("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      // DEV-ONLY: remove before handoff
      setStatus(__DEV__ ? MOCK_ADMIN_ACCESS : "denied");
    }, ACCESS_CHECK_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("checking");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  return { status, retry };
}
