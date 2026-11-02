import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export function useAdminAccess() {
  const [status, setStatus] = useState("checking");
  const [attempt, setAttempt] = useState(0);
  const { refreshRole } = useAuth();

  useEffect(() => {
    let active = true;

    setStatus("checking");

    refreshRole()
      .then((resolvedRole) => {
        if (!active) {
          return;
        }

        setStatus(
          resolvedRole === "admin" ? "allowed" : "denied",
        );
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, refreshRole]);

  const retry = useCallback(() => {
    setStatus("checking");
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  return { status, retry };
}
