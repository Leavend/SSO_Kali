import AuthStatusPage from "@/components/AuthStatusPage";
import AutoRetryCountdown from "@/components/AutoRetryCountdown";
import { handshakeFailedCopy } from "@/lib/auth-status-copy";

export default function HandshakeFailedPage() {
  return (
    <AuthStatusPage {...handshakeFailedCopy}>
      <AutoRetryCountdown
        redirectTo="/auth/login"
        seconds={8}
        label="Auto-redirect dalam"
      />
    </AuthStatusPage>
  );
}
