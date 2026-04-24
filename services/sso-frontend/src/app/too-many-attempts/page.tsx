import AuthStatusPage from "@/components/AuthStatusPage";
import { tooManyAttemptsCopy } from "@/lib/auth-status-copy";

export default function TooManyAttemptsPage() {
  return <AuthStatusPage {...tooManyAttemptsCopy} />;
}
