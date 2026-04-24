import AuthStatusPage from "@/components/AuthStatusPage";
import { accessDeniedCopy } from "@/lib/auth-status-copy";

export default function AccessDeniedState() {
  return <AuthStatusPage {...accessDeniedCopy} />;
}
