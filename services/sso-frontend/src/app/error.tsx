"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ErrorScreen";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[admin-panel] route error", error);
  }, [error]);

  return (
    <ErrorScreen
      title="Admin page failed to render"
      description="Please retry the page. If the problem keeps happening, review the admin API logs."
      onRetry={reset}
    />
  );
}
