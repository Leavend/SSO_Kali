import AuthStatusPage from "@/components/AuthStatusPage";
import AutoRetryCountdown from "@/components/AutoRetryCountdown";
import { sessionExpiredCopy } from "@/lib/auth-status-copy";

export default function SessionExpiredPage() {
  return (
    <AuthStatusPage {...sessionExpiredCopy}>
      <AutoRetryCountdown
        redirectTo="/auth/login"
        seconds={10}
        label="Auto-redirect ke login dalam"
      />
    </AuthStatusPage>
  );
}
