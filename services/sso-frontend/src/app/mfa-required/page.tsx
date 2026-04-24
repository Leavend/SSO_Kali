import AuthStatusPage from "@/components/AuthStatusPage";
import { mfaRequiredCopy } from "@/lib/auth-status-copy";

export default function MfaRequiredPage() {
  return <AuthStatusPage {...mfaRequiredCopy} />;
}
