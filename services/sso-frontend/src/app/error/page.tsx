import AuthStatusPage from "@/components/AuthStatusPage";
import AutoRetryCountdown from "@/components/AutoRetryCountdown";
import { genericErrorCopy } from "@/lib/auth-status-copy";

export default function GenericErrorPage() {
  return (
    <AuthStatusPage {...genericErrorCopy}>
      <AutoRetryCountdown
        redirectTo="/auth/login"
        seconds={12}
        label="Auto-redirect dalam"
      />
    </AuthStatusPage>
  );
}
