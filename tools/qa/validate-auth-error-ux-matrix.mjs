import { readFileSync } from "node:fs";

import {
  fallbackErrorCatalog,
  localeErrorCatalog,
} from "../../infra/zitadel-login/login-copy-catalog.mjs";

const frontendMatrix = JSON.parse(
  readFileSync(
    new URL("../../services/sso-frontend/src/lib/auth-status-matrix.json", import.meta.url),
    "utf8",
  ),
);

const scenarioCoverage = {
  accessDenied: [
    "linkingNotAllowed",
    "localAuthenticationNotAllowed",
    "passkeysNotAllowed",
    "userInitialStateNotSupported",
    "userNotActive",
  ],
  handshakeFailed: [
    "contextMissing",
    "couldNotFindSession",
    "couldNotGetLoginSettings",
    "couldNotUpdateSession",
    "missingParameters",
    "sessionExpired",
    "sessionNotValid",
    "unknownContext",
  ],
  invalidCredentials: [
    "couldNotSearchUsers",
    "couldNotVerifyPassword",
    "failedToAuthenticate",
    "failedToAuthenticateNoLimit",
  ],
  mfaRequired: [
    "codeOrVerificationRequired",
    "passwordVerificationMissing",
    "passwordVerificationTooOld",
    "verificationRequired",
  ],
  reauthRequired: [
    "codeOrVerificationRequired",
    "passwordVerificationMissing",
    "passwordVerificationTooOld",
    "verificationRequired",
  ],
  tooManyAttempts: [
    "failedToAuthenticateNoLimit",
    "lockoutMessage",
  ],
  accountNotActive: [
    "userNotActive",
  ],
  passwordResetFailure: [
    "couldNotChangePassword",
    "couldNotResetPassword",
    "couldNotSendResetLink",
    "couldNotSetPassword",
  ],
  emailVerificationFailure: [
    "couldNotResendEmail",
    "couldNotVerifyEmail",
    "emailSendFailed",
    "userAlreadyVerified",
  ],
  invitationFailure: [
    "couldNotResendInvite",
    "couldNotVerifyInvite",
    "inviteSendFailed",
  ],
};

const routeExpectations = {
  accessDenied: { route: "/access-denied", taxonomy: "forbidden" },
  handshakeFailed: { route: "/handshake-failed", taxonomy: "handshake_failed" },
  invalidCredentials: { route: "/invalid-credentials", taxonomy: "invalid_credentials" },
  mfaRequired: { route: "/mfa-required", taxonomy: "mfa_required" },
  reauthRequired: { route: "/reauth-required", taxonomy: "reauth_required" },
  tooManyAttempts: { route: "/too-many-attempts", taxonomy: "too_many_attempts" },
};

const curatedLocaleKeys = [
  "couldNotResetPassword",
  "couldNotResendEmail",
  "couldNotResendInvite",
  "couldNotRegisterUser",
  "couldNotVerifyEmail",
  "couldNotVerifyInvite",
  "failedToAuthenticate",
  "lockoutMessage",
  "linkingNotAllowed",
  "multipleUsersFound",
  "sessionExpired",
  "userNotActive",
  "userAlreadyVerified",
  "userInitialStateNotSupported",
  "verificationRequired",
];

assertFrontendMatrix();
assertHostedLoginCoverage();
assertCuratedLocales();

console.log("auth error ux matrix validation passed");

function assertFrontendMatrix() {
  for (const [scenario, expected] of Object.entries(routeExpectations)) {
    const entry = frontendMatrix[scenario];
    assert(entry, `Missing frontend scenario ${scenario}`);
    assert(entry.route === expected.route, `Unexpected route for ${scenario}`);
    assert(entry.taxonomy === expected.taxonomy, `Unexpected taxonomy for ${scenario}`);
    assert(entry.copy?.title, `Missing title for ${scenario}`);
    assert(entry.copy?.description, `Missing description for ${scenario}`);
    assert(entry.copy?.primaryAction?.label, `Missing primary action label for ${scenario}`);
    assert(entry.copy?.primaryAction?.href, `Missing primary action href for ${scenario}`);
    assertNoLeak(entry.copy, scenario);
  }
}

function assertHostedLoginCoverage() {
  for (const [scenario, keys] of Object.entries(scenarioCoverage)) {
    for (const key of keys) {
      assert(fallbackErrorCatalog[key], `Missing hosted-login key ${key} for ${scenario}`);
    }
  }
}

function assertCuratedLocales() {
  for (const locale of ["de", "es", "fr", "id", "ru"]) {
    const catalog = localeErrorCatalog[locale];
    assert(catalog, `Missing curated locale ${locale}`);
    for (const key of curatedLocaleKeys) {
      assert(catalog[key], `Missing ${locale}.${key}`);
    }
  }
}

function assertNoLeak(copy, scenario) {
  const serialized = JSON.stringify(copy);
  assert(
    !/digest|exception|stack|trace|server component|api logs/i.test(serialized),
    `Leaky copy detected for ${scenario}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
