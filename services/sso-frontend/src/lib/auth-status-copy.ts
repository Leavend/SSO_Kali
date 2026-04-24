import authStatusMatrixJson from "@/lib/auth-status-matrix.json";

export type AuthStatusCopy = {
  readonly badge: string;
  readonly title: string;
  readonly description: string;
  readonly accent: "accent" | "danger" | "warning";
  readonly primaryAction: {
    readonly href: string;
    readonly label: string;
  };
  readonly secondaryAction?: {
    readonly href: string;
    readonly label: string;
  };
  readonly note?: string;
};

export type AuthStatusTaxonomy =
  | "forbidden"
  | "handshake_failed"
  | "invalid_credentials"
  | "mfa_required"
  | "reauth_required"
  | "too_many_attempts"
  | "session_expired"
  | "generic_error";

export type AuthStatusScenario = {
  readonly taxonomy: AuthStatusTaxonomy;
  readonly route: string;
  readonly copy: AuthStatusCopy;
};

type AuthStatusMatrix = {
  readonly accessDenied: AuthStatusScenario;
  readonly handshakeFailed: AuthStatusScenario;
  readonly invalidCredentials: AuthStatusScenario;
  readonly mfaRequired: AuthStatusScenario;
  readonly reauthRequired: AuthStatusScenario;
  readonly tooManyAttempts: AuthStatusScenario;
  readonly sessionExpired: AuthStatusScenario;
  readonly genericError: AuthStatusScenario;
};

export const authStatusMatrix = authStatusMatrixJson as AuthStatusMatrix;

export const accessDeniedCopy = authStatusMatrix.accessDenied.copy;
export const reauthRequiredCopy = authStatusMatrix.reauthRequired.copy;
export const invalidCredentialsCopy = authStatusMatrix.invalidCredentials.copy;
export const mfaRequiredCopy = authStatusMatrix.mfaRequired.copy;
export const handshakeFailedCopy = authStatusMatrix.handshakeFailed.copy;
export const tooManyAttemptsCopy = authStatusMatrix.tooManyAttempts.copy;
export const sessionExpiredCopy = authStatusMatrix.sessionExpired.copy;
export const genericErrorCopy = authStatusMatrix.genericError.copy;
